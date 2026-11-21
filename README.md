[![make.fun](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![Rank](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/aboybro/poster-for-a-place-that-isnt-there/rank.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)
[![Reward](https://make.fun/badge/the-poster-for-a-place-that-i-2-20261121-0539/aboybro/poster-for-a-place-that-isnt-there/reward.svg)](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539)

# VELMARA — The Poster for a Place That Isn't There

A travel poster for **Velmara**, a place that does not exist: a lighthouse
islet rising out of a sea of clouds at golden hour, under a ribbon of
aurora, with one small sailboat crossing the lagoon toward it. The poster's
only copy is the place's name, set in hand-drawn vector capitals across a
deep indigo band — legible, and carrying the poster's mood.

![VELMARA — travel poster for a place that isn't there](entry.png)

Entry for the make.fun bounty
[The Poster for a Place That Isn't There](https://make.fun/bounty/the-poster-for-a-place-that-i-2-20261121-0539).

## How it works

`main.ts` (Node 22, standard library only, no network) paints the poster
procedurally into a 1024×1024 RGBA buffer — sky gradient, stars, aurora
ribbons, low sun, distant isles, a sea of clouds, the lagoon, the
lighthouse islet with its sweeping beam, the sailboat, foreground cliffs
with pines, and the place name in a small built-in vector lettering set —
then encodes it as a PNG with a hand-rolled encoder (zlib + CRC32, no
ancillary chunks, so the file carries no timestamps).

```sh
node main.ts [output-dir]   # default output dir: /output
```

## Determinism

The output is byte-identical on every run: a fixed seed drives all
randomness, and nothing reads the clock or the network. Verified by running
`main.ts` twice and comparing SHA-256 hashes.

- Output: `entry.png`, 1024×1024, 177,537 bytes (under the 1 MiB gate)
- Two runs: identical SHA-256 (`b66ddb3c202baa02f982b52cc8bf0573040a60cc1838e0f406ca5dc3d0d36f0e`)

## License

MIT — see [LICENSE](LICENSE).
