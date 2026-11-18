# Contributing

Bug reports and pull requests are welcome. For a large change, open an issue first so we can talk it through.

1. Fork the repository and create a branch.
2. Follow "Run it locally" in the [README](README.md). Edit `src/`, run `npm run dev` to try it, then `npm run build` and commit the rebuilt `index.html` with your change.
3. Run `npm run test:unit` and `npm run smoke` before opening the pull request. If you touched `macos/`, run `npm run saver` on a Mac too.
4. Keep the pull request small and focused, and describe what you changed and why.

The pictures of Spot (the 3D scan, the portrait and the traced vector Spot) are not under the MIT licence; please don't reuse them elsewhere.

Never commit secrets, API keys or `.env` files. By contributing you agree that your work is released under this project's licence.
