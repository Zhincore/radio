import { opendir } from "fs/promises";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { spawn } from "child_process";
import config from "./config.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".mp4", ".m4a"];
const DESIRED_PLAYLIST_LENGTH = 8;
const HIGH_WATER_MARK = 1;

const audioConf = config.advanced;

export class Radio {
  playlist = [];
  output = new PassThrough({
    highWaterMark: HIGH_WATER_MARK,
    allowHalfOpen: false,
    decodeStrings: false,
    objectMode: false,
  });

  constructor(musicFolder) {
    this.musicFolder = Path.resolve(musicFolder.replace(/^~/, () => os.homedir()));
    this.play();
  }

  async fillPlaylist() {
    const dir = [];

    for await (const dirent of await opendir(this.musicFolder)) {
      if (!dirent.isFile() || !ALLOW_EXTS.includes(Path.extname(dirent.name))) continue;

      dir.push(dirent.name);
    }

    if (!dir.length) throw new Error(`Folder ${this.musicFolder} contains no playable files!`);

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
        process.env.NODE_ENV === "production" && ["-v", "warning"],
        ["-re"],
        ["-i", Path.join(this.musicFolder, song)],
        ["-use_wallclock_as_timestamps", 1],
        ["-rtbufsize", "8k"],
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
      { maxBuffer: 1024 },
    );
    ffmpeg.stderr.pipe(process.stderr, { end: false });

    // NOTE: discouraged
    ffmpeg.stdout._readableState.highWaterMark = HIGH_WATER_MARK;

    ffmpeg.stdout.pipe(this.output, { end: false });

    ffmpeg.on("close", () => {
      ffmpeg.stderr.unpipe();
      ffmpeg.stdout.unpipe();
      this.play();
    });
  }
}

function shuffle(array) {
  array.sort(() => Math.random() - 0.5);
}
