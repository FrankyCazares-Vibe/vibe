#!/bin/zsh
# The landing's committed stills and the film's poster (S72 design 2), cut
# from the master film: public/landing/still-*.{avif,webp,jpg} and
# film-poster-*. Each is a screen with no photo of anyone in it, cropped
# below the app's crimson campus bar:
# - Orgs at 12.6 s, settled: the crop stops above SAE, whose avatar is a photo.
# - Events at 10.2 s: Blitz Night marked Going.
# - The DM to James at 23.6 s, "you going?" sent: the crop starts at y=660,
#   below the header and its photo.
# - The poster: the Chess Club chat at 18.6 s, whole (no crimson bar there).
# LOOK at every file this writes before committing it: no face, no photo.
#
#   scripts/demo-video/stills.sh [master.mp4] [out-folder]
#
# Defaults: ~/vibe-demo-video/vibe-demo-30s-master.mp4 and public/landing/.
set -e
ROOT=${0:A:h:h:h}
M=${1:-$HOME/vibe-demo-video/vibe-demo-30s-master.mp4}
OUT=${2:-$ROOT/public/landing}
S=$(mktemp -d)
grab() { ffmpeg -v error -y -ss $2 -i $M -frames:v 1 -vf "$3" $S/$1.png; }
grab still-orgs   12.6 "crop=1170:1462:0:196"
grab still-events 10.2 "crop=1170:1462:0:196"
grab still-dm     23.6 "crop=1170:1462:0:660"
grab film-poster  18.6 "null"
mkdir -p $OUT
node $ROOT/scripts/demo-video/stills.mjs $S $OUT
rm -r $S
