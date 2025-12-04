# StremSRC

A VidSRC extractor addon for Stremio that provides streaming links for movies and TV series.

## Description

StremSRC is a Stremio addon that extracts streaming sources from VidSRC, allowing you to watch movies and TV shows directly through Stremio. The addon scrapes available servers and provides playable stream URLs.

## Features

- **Movie Support**: Extract streams for movies using IMDB IDs
- **TV Series Support**: Extract streams for TV episodes using IMDB IDs with season/episode format
- **Stremio Integration**: Seamless integration with Stremio's interface

## Installation

### Public Instance

The addon is deployed and available at: **https://stremsrc.theditor.xyz**

To install in Stremio:
1. Open Stremio
2. Go to Settings → Addons
3. Click "Add Addon" 
4. Enter: `https://stremsrc.theditor.xyz/manifest.json`
5. Click "Install"

### Local Development

1. Clone this repository:
```bash
git clone git@github.com:ThEditor/stremsrc.git
cd stremsrc
```

2. Install dependencies:
```bash
pnpm install
```

3. Build the project:
```bash
pnpm run build
```

4. Start the addon:
```bash
pnpm start
```

The addon will be available at `http://localhost:56245`

## Project Structure

```
src/
├── addon.ts      # Main addon configuration and stream handler
├── extractor.ts  # VidSRC extraction logic and server processing
└── index.ts      # HTTP server setup and entry point
```

## Deployment

### Vercel

The project includes vercel.json configuration for easy deployment to Vercel:

```bash
vercel --prod
```

### Other Platforms

Build the project and deploy the dist folder to any Node.js hosting platform.

## Credits

Original extraction logic written by [cool-dev-guy](https://github.com/cool-dev-guy/vidsrc.ts)

## License

This project is for educational purposes only. Please ensure compliance with applicable laws and terms of service when using streaming sources.