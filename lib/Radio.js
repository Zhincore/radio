import { opendir } from "fs/promises";
import { PassThrough } from "stream";
import Path from "path";
import os from "os";
import { FFmpeg } from "./FFmpeg.js";

const ALLOW_EXTS = [".mp3", ".ogg", ".mp4", ".m4a"];
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
   * @param {import("http").IncomingMessage} request
   * @param {{ end?: boolean }} opts
   * @returns
   */
  connect(request, opts) {
    this.connections.add(request);
    this.onConnectionsUpdate();

    request.on("close", () => {
      this.connections.delete(request);
      this.onConnectionsUpdate();

      this.output.unpipe(request);
    });

    return this.output.pipe(request, opts);
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
    this.ffmpeg = new FFmpeg(Path.join(this.musicFolder, song), this.output, this.paused);

    this.ffmpeg.on("end", () => {
      this.ffmpeg = null;
      this.play();
    });
  }
}

function shuffle(array) {
  array.sort(() => Math.random() - 0.5);
}
