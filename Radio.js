import { opendir } from "fs/promises";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { spawn } from "child_process";
import config from "./config.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".mp4", ".m4a"];

const audioConf = config.advanced;

export class Radio {
  playlist = [];
  output = new PassThrough({
    highWaterMark: 1024,
  });

  constructor(musicFolder) {
    this.musicFolder = Path.resolve(musicFolder.replace(/^~/, os.homedir()));
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
    } while (dir.length != 1 && dir[0] == this.playlist[this.playlist.length - 1]);

    this.playlist.push(...dir);
  }

  async nextSong() {
    if (!this.playlist.length) await this.fillPlaylist();

    return this.playlist.shift();
  }

  async play() {
    const song = await this.nextSong();
    const decoder = spawn(
      "ffmpeg",
      [
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
        .flat()
        .filter((v) => v),
    );
    decoder.stderr.pipe(process.stderr);

    decoder.stdout._readableState.highWaterMark = 1024;
    decoder.stdout.pipe(this.output, { end: false });

    decoder.on("close", () => {
      decoder.stderr.unpipe();
      decoder.stdout.unpipe();
      this.play();
    });
  }
}

function shuffle(array) {
  array.sort(() => Math.random() - 0.5);
}
