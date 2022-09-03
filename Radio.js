import fs from "fs/promises";
import { rmSync } from "fs";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { spawn } from "child_process";
import { promisify } from "util";
import { onExit } from "./onExit.js";
import config from "./config.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".mp4", ".m4a"];
const DESIRED_PLAYLIST_LENGTH = 8;
const HIGH_WATER_MARK = 1;

let TMPD;
const TMPD_PROMISE = fs.mkdtemp(Path.join(os.tmpdir(), "zhinradio-")).then((v) => (TMPD = v));

let closing = false;
const ffmpegs = new Set();
const outputs = [];
const audioConf = config.advanced;

export class Radio {
  musicFolder = null;
  name = "default";
  playlist = [];
  output = new PassThrough({
    highWaterMark: HIGH_WATER_MARK,
    allowHalfOpen: false,
    decodeStrings: false,
    objectMode: false,
  });

  constructor(name, musicFolder) {
    this.name = name;
    this.musicFolder = Path.resolve(musicFolder.replace(/^~/, () => os.homedir()));
    this.play();
    outputs.push(this.output);
  }

  async fillPlaylist() {
    const dir = [];

    for await (const dirent of await fs.opendir(this.musicFolder)) {
      if (!dirent.isFile() || !ALLOW_EXTS.includes(Path.extname(dirent.name))) continue;

      dir.push(dirent.name);
    }

    if (!dir.length)
      throw new Error(`Folder '${this.musicFolder}' of radio '${this.name}' contains no playable files!`);

    do {
      shuffle(dir);
      // prevent repeating same song if possible
    } while (dir.length > 1 && dir[0] == this.playlist[this.playlist.length - 1]);

    this.playlist.push(...dir);
  }

  async nextSong() {
    if (this.playlist.length < DESIRED_PLAYLIST_LENGTH) await this.fillPlaylist();

    return this.playlist.shift();
  }

  async play() {
    const song = await this.nextSong();
    const ffmpeg = spawn(
      "ffmpeg",
      [
        ["-flags", "+low_delay"],
        ["-fflags", "+flush_packets+nobuffer"],
        ["-avioflags", "direct"],
        process.env.NODE_ENV === "production" && ["-v", "warning"],
        ["-re"],
        ["-i", Path.join(this.musicFolder, song)],
        ["-use_wallclock_as_timestamps", 1],
        ["-map_metadata", -1],
        ["-map", "a:0"],
        ["-vn"],
        ["-af", `apad=pad_dur=${audioConf.padding}`],
        ["-ar", audioConf.sampleRate],
        ["-ac", audioConf.channels],
        ["-b:a", audioConf.bitRate],
        ["-c:a", "libmp3lame"],
        ["-f", "mp3"],
        "-",
      ]
        .filter((v) => v)
        .flat(),
    );
    ffmpegs.add(ffmpeg);
    ffmpeg.stderr.pipe(process.stderr, { end: false });

    ffmpeg.stdout._readableState.highWaterMark = HIGH_WATER_MARK;
    ffmpeg.stdout.pipe(this.output);

    ffmpeg.on("close", () => {
      ffmpeg.stderr.unpipe();
      ffmpeg.stdout.unpipe();
      ffmpegs.delete(ffmpeg);
      if (!closing) this.play();
    });
  }
}

function shuffle(array) {
  array.sort(() => Math.random() - 0.5);
}

function exitHook(async) {
  if (closing) return;
  closing = true;
  if (!async) {
    if (TMPD) rmSync(TMPD, { recursive: true, force: true });
    return;
  }

  (async () => {
    const promises = [];

    for (const ffmpeg of ffmpegs) {
      promises.push(promisify(ffmpeg.on.bind(ffmpeg, "close")));
      ffmpeg.kill("SIGTERM");
    }
    await Promise.all(promises);

    for (const output of outputs) {
      output.end();
    }

    fs.rm(await TMPD_PROMISE, { recursive: true, force: true });
  })().catch(console.error);
}

onExit(exitHook);
