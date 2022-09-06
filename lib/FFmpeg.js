import EventEmitter from "events";
import { spawn } from "child_process";
import config from "../config.js";

const audioConf = config.advanced;
const HIGH_WATER_MARK = 1;

export class FFmpeg extends EventEmitter {
  #process = null;
  #playing = false;

  constructor(path, output, paused) {
    super();

    this.path = path;
    this.output = output;
    this.#init(paused);
  }

  resume() {
    if (this.#playing || !this.#process) return false;

    const res = this.#process.kill("SIGCONT");
    if (res) {
      this.#playing = true;
      this.emit("resumed");
    }

    return res;
  }

  pause() {
    if (!this.#playing || !this.#process) return false;

    const res = this.#process.kill("SIGSTOP");
    if (res) {
      this.#playing = false;
      this.emit("paused");
    }

    return res;
  }

  #init(paused = false) {
    const ffmpeg = spawn(
      "ffmpeg",
      [
        ["-flags", "+low_delay"],
        ["-fflags", "+flush_packets+nobuffer"],
        ["-avioflags", "direct"],
        process.env.NODE_ENV === "production" && ["-v", "warning"],
        ["-re"],
        ["-i", this.path],
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
    );

    ffmpeg.stderr.pipe(process.stderr, { end: false });

    // NOTE: Accessing `_readableState` is discouraged, but it allows for smaller latency
    ffmpeg.stdout._readableState.highWaterMark = HIGH_WATER_MARK;
    ffmpeg.stdout.pipe(this.output, { end: false });

    this.#process = ffmpeg;
    this.#playing = true;
    if (paused) this.pause();

    this.emit("start");
    ffmpeg.on("close", () => {
      this.#playing = false;
      this.#process = null;
      ffmpeg.stderr.unpipe();
      ffmpeg.stdout.unpipe();
      this.emit("end");
    });
  }
}
