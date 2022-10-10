import { opendir } from "fs/promises";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { FFmpeg } from "./FFmpeg.js";
import config from "../config.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".opus", ".mp4", ".m4a", ".wav"];
const MIN_PLAYLIST_LENGTH = 16;
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
  lastWasAd = true;

  constructor(musicFolder, adFolder, musicCount, adCount) {
    this.musicFolder = Path.resolve(musicFolder.replace(/^~/, () => os.homedir()));
    this.adFolder = Path.resolve(adFolder.replace(/^~/, () => os.homedir()));
    this.musicCount = musicCount;
    this.adCount = adCount;
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

      if (dirent.isFile() && ALLOW_EXTS.includes(Path.extname(dirent.name))) {
        dir.push(subpath);
      }
    }

    return Promise.all(promises).then((d) => [dir, d].flat(2));
  }

  async fillPlaylist() {
    while (this.playlist.length < MIN_PLAYLIST_LENGTH) {
      const dir = await this.searchFolder(this.lastWasAd ? this.musicFolder : this.adFolder);
      if (!dir.length) throw new Error(`Folder ${this.musicFolder} contains no playable files!`);
      const checkChunk = Math.min(dir.length, MIN_PLAYLIST_LENGTH);
      const lastFew = this.playlist.slice(-checkChunk);

      shuffle(dir);
      for (let i = this.lastWasAd ? this.musicCount : this.adCount; i > 0; i--) {
        let j;
        do {
          j = Math.floor(Math.random() * dir.length);
          // prevent repeating same song if possible
        } while (dir.length > checkChunk && lastFew.includes(dir[j]));
        this.playlist.push(...dir.splice(j, 1));
        console.log(this.lastWasAd ? "music" : "ad");
      }
      this.lastWasAd = !this.lastWasAd;
    }
  }

  async nextSong() {
    if (this.playlist.length < MIN_PLAYLIST_LENGTH) await this.fillPlaylist();

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
