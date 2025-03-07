# to-mp4

Dummy nodejs script that converts a video file to MP4 format using the ffmpeg library.

## Without docker

Requirements:

- Node >= 20
- ffmpeg
- ffprobe

### Usage

```shell
# install deps
npm i
# from the root directory
npx tsx ./src/index.ts {path-to-video} --width 1280 --crf 25 --bitrate '400K'
```

## With docker

Requirement:

- Docker

### Usage with docker

```shell

# start docker
docker compose up
# install deps
docker compose exec node npm i
# from root directory
docker compose exec node npx tsx ./src/index.ts {path-to-video}
```

## Credits

[Willy Brauner](https://willybrauner.com)
