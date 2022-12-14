import { opendir } from "fs/promises";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { FFmpeg } from "./FFmpeg.js";
import config from "../config.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".opus", ".mp4", ".m4a", ".wav"];
const DESIRED_PLAYLIST_LENGTH = 8;
const HIGH_WATER_MARK = 1;

export class Radio {
  playlist = [];
  output = new PassThrough({
    highWaterMark: HIGH_WATER_MARK,
    allowHalfOpen: false,
    decodeStrings: false,
    objectMode: false,
  });

  /** @type {FFmpeg} */
  ffmpeg = null;
  paused = false;
  connections = new Set();

  constructor(musicFolder) {
    this.musicFolder = Path.resolve(musicFolder.replace(/^~/, () => os.homedir()));
    this.onConnectionsUpdate();
    this.play();
  }

  /**
   *
   * @param {import("http").ServerResponse} response
   * @param {{ end?: boolean }} opts
   * @returns
   */
  connect(response, opts) {
    response.once("pipe", () => {
      this.connections.add(response);
      this.onConnectionsUpdate();
    });

    response.once("close", () => {
      this.connections.delete(response);
      this.onConnectionsUpdate();

      this.output.unpipe(response);
    });

    return this.output.pipe(response, opts);
  }

  onConnectionsUpdate() {
    const connCount = this.connections.size;
    if (connCount) {
      this.paused = false;
      this.ffmpeg?.resume();
    } else if (!connCount) {
      this.paused = true;
      this.ffmpeg?.pause();
    }
  }

  async searchFolder(path) {
    const promises = [];
    const dir = [];

    for await (const dirent of await opendir(path)) {
      const subpath = Path.join(path, dirent.name);

      if (dirent.isDirectory()) {
        if (config.recursive) promises.push(this.searchFolder(subpath));
      } else if (dirent.isFile() && ALLOW_EXTS.includes(Path.extname(dirent.name))) {
        dir.push(subpath);
      }
    }

    return Promise.all(promises).then((d) => [dir, d].flat(2));
  }

  async fillPlaylist() {
    const dir = await this.searchFolder(this.musicFolder);
    if (!dir.length) throw new Error(`Folder ${this.musicFolder} contains no playable files!`);
    console.log(dir.reverse());

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
    this.ffmpeg = new FFmpeg(song, this.output, this.paused);

    this.ffmpeg.on("end", () => {
      this.ffmpeg = null;
      this.play();
    });
  }
}

function shuffle(array) {
  return array.sort(() => Math.random() - 0.5);
}
