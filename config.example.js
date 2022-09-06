export default {
  /**
   * Sources to take music from, the format is `name: "/path/to/folder"`.
   * Name is then used in url (e.g. `/name` will play radio with name "name")
   */
  sources: {
    default: "~/Music", // Name `default` will be available under both urls `/` and `/default`
  },
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
