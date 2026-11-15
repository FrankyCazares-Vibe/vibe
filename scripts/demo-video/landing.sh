#!/bin/zsh
# The landing's two web films ("A day on Vibe"), cut from the master film: the phone screen itself, no frame,
# at two thirds and one third of the master's size, the way the Oct 3 films on Vercel Blob were made
# (src/lib/landing/demo-media.ts names them):
#   vibe-demo-780.mp4   780x1688, H.264 High, 60 fps, about 0.6 Mbit/s
#   vibe-demo-390.mp4   390x844,  H.264 High, 60 fps, about 0.3 Mbit/s
# No sound, bt709 tags, moov at the front (plays while it loads). Nothing is uploaded: that is Franky's step.
# Browsers keep the Blob copies for 30 days, so a re-cut wants new file names or a cache-busting query on the page.
#
#   scripts/demo-video/landing.sh [master.mp4] [out-folder]
#
# Defaults: ~/vibe-demo-video/vibe-demo-30s-master.mp4 and ~/vibe-demo-video/landing/.
set -e
M=${1:-$HOME/vibe-demo-video/vibe-demo-30s-master.mp4}
OUT=${2:-$HOME/vibe-demo-video/landing}
FF=/opt/homebrew/bin/ffmpeg
# The films show Franky's own pictures and the repo is public: never write them inside a git work tree.
mkdir -p $OUT
if git -C "$OUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then echo "refusing: $OUT is inside a git work tree"; exit 2; fi
TAGS=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart -an)
TO="out_color_matrix=bt709:out_range=tv,format=yuv420p,setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=bt709"
$FF -v error -y -i $M -vf "scale=780:1688:flags=lanczos:$TO" -c:v libx264 -preset slow -crf 27 -g 1800 -level:v 4.2 -r 60 $TAGS $OUT/vibe-demo-780.mp4
$FF -v error -y -i $M -vf "scale=390:844:flags=lanczos:$TO" -c:v libx264 -preset slow -crf 27 -g 1800 -level:v 4.0 -r 60 $TAGS $OUT/vibe-demo-390.mp4
for f in $OUT/vibe-demo-780.mp4 $OUT/vibe-demo-390.mp4; do
  echo "$f: $(/opt/homebrew/bin/ffprobe -v error -select_streams v:0 -show_entries stream=profile,level,width,height,r_frame_rate,nb_frames,bit_rate:format=duration,size -of csv=p=0 $f | tr '\n' ' ')"
done
