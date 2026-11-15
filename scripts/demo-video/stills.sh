#!/bin/zsh
# The landing's committed stills and the film's poster (S72 design 2), cut
# from the master film: public/landing/still-*.{avif,webp,jpg} and
# film-poster-*. Each is a screen with no photo of anyone in it. Since the
# Nov 14 take the campus bar is left out of the film (no school mark), so
# the campus crops start at the top, chips included:
# - Orgs at 11.7 s, settled: the clubs he follows, initials only.
# - Events at 10.2 s: "Coming up", Blitz Night marked Going.
# - The DM to James at 23.6 s, the line sent: the crop starts at y=660,
#   below the header.
# - The poster: Chess Club's Lounge at 18.7 s, the poll, whole.
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
grab still-orgs   11.7 "crop=1170:1462:0:0"
grab still-events 10.2 "crop=1170:1462:0:0"
grab still-dm     23.6 "crop=1170:1462:0:660"
grab film-poster  18.7 "null"
mkdir -p $OUT
node $ROOT/scripts/demo-video/stills.mjs $S $OUT
rm -r $S
