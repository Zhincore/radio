# Radio

Simple audio streaming app in NodeJS with zero dependencies

## Features

- Lightweight
- Simple to use
- Supports multiple radios
- Stops playing when noone's listening
- Chooses files at random and tries to repeat as little as possible

## Requirements

- NodeJS
- FFmpeg
- (Recommended) HTTP2 reverse proxy like NGINX or Apache

## Usage

1. Copy `config.example.js` to `config.js`.
2. Change `config.js` to your needs.
3. Start with `node .`, `node lib/main` or `npm start`

Start with environment variable `NODE_ENV=production` to hide console spam from ffmpeg.
