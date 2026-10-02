#!/bin/sh
# Download the original (OFL) font files into analysis/fonts-src/ (only needed to re-run make_fonts.py).
set -e
cd "$(dirname "$0")" && mkdir -p fonts-src && cd fonts-src
B=https://raw.githubusercontent.com/google/fonts/main/ofl
while read -r src dst; do
  curl -sSfL -o "$dst" "$B/$src" && echo "ok $dst"
done <<LIST
delagothicone/DelaGothicOne-Regular.ttf DelaGothicOne-Regular.ttf
notosansjp/NotoSansJP%5Bwght%5D.ttf NotoSansJP-VF.ttf
notoserifjp/NotoSerifJP%5Bwght%5D.ttf NotoSerifJP-VF.ttf
dotgothic16/DotGothic16-Regular.ttf DotGothic16-Regular.ttf
mplus1code/MPLUS1Code%5Bwght%5D.ttf MPLUS1Code-VF.ttf
jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf JetBrainsMono-VF.ttf
yujisyuku/YujiSyuku-Regular.ttf YujiSyuku-Regular.ttf
reggaeone/ReggaeOne-Regular.ttf ReggaeOne-Regular.ttf
rampartone/RampartOne-Regular.ttf RampartOne-Regular.ttf
zenkakugothicnew/ZenKakuGothicNew-Black.ttf ZenKakuGothicNew-Black.ttf
shipporiminchob1/ShipporiMinchoB1-ExtraBold.ttf ShipporiMinchoB1-ExtraBold.ttf
LIST
