export default {
  music: "~/Music",
  ads: "~/Music",
  musicCount: 3,
  adCount: 3,
  /** Port to listen on. Set as 0 to let the OS choose, or `null` to use 9099 */
  port: 9099,

  /** These are passed to ffmpeg */
  advanced: {
    bitRate: "128k",
    sampleRate: 44100,
    channels: 2,
    /** Seconds of silence between files, prevents audio glitches between songs */
    padding: 1,
  },
};
