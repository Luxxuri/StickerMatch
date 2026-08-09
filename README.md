# StickerMatch

StickerMatch is a browser tool for correcting sticker colors that change when they are loaded into Roblox. Your images, saved colors, and calibration history stay in your own browser.

## Matching a color

1. Click **Import sticker** and choose a transparent PNG.
2. Set **Target** to the color you want.
3. Export the first PNG and load it into Roblox.
4. Use **Pick from screen** on **Rendered** and select the background Roblox shows.
5. Click **Calculate correction**.
6. Export the corrected PNG and test it again.

Chrome and Edge support the screen eyedropper. If your browser does not, enter the HEX color manually.

## Saving a match

When a color is finished, type a name such as `Tan` under **Match name** and click **Save match**.

For the next sticker, choose Tan under **Saved colors**, click **Load**, import the new PNG, and export. The saved name is used in the filename instead of the HEX code.

Saved colors and calibration history use browser storage. Clearing the site's browser data removes them.

## Uploading to Roblox

StickerMatch downloads the finished PNG to your computer. Upload that PNG manually through Roblox Creator Dashboard or Studio. The browser tool does not connect to Roblox and never asks you to sign in.

## Privacy

There are no analytics, accounts, or network uploads. Images are processed locally and downloaded directly by your browser.
