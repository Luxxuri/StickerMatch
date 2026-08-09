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

## Roblox texture setup

The browser version uses Roblox OAuth instead of API keys.

1. Follow the [Roblox OAuth app registration guide](https://create.roblox.com/docs/cloud/auth/oauth2-registration).
2. Create a public client and add the redirect URL shown under **Roblox OAuth setup**.
3. Add the `openid`, `asset:read`, and `asset:write` permissions.
4. Paste the OAuth client ID into StickerMatch. Do not enter a client secret.
5. Choose your user account or group and enter its numeric ID.
6. Click **Sign in with Roblox** and approve the requested asset access.

After exporting a sticker, click **Create texture**. The result gives you the directly usable texture ID and a copy button.

Roblox access tokens last only for the current browser session. StickerMatch never asks for a Roblox password, browser cookie, API key, or client secret.

## Privacy

There are no analytics. Images are processed locally and are only sent anywhere when you click **Create texture**, which sends the most recent export directly to Roblox.
