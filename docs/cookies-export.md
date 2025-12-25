# Exporting cookies for FireFetch (cookies.txt)

Some sites require you to be logged in to access certain videos. FireFetch supports this by letting you upload a **Netscape-format** `cookies.txt` file.

## Recommended: “Get cookies.txt LOCALLY” extension

1. Install the browser extension **“Get cookies.txt LOCALLY”** for your browser.
2. Open the site you want to download from and **log in**.
3. Click the extension icon and choose **“Export cookies.txt”**.
4. In FireFetch, open **Config → Authentication → Cookie File → Upload** and select the exported `cookies.txt`.

## Important notes

- **Keep it local**: cookies can grant account access. Don’t share the file.
- **Use the Netscape format**: FireFetch expects the traditional `cookies.txt` format.
- **Expiration**: cookies can expire; re-export if downloads start failing.
- **Multiple sites**: the exported file may include cookies for many domains. That’s normal.

## Troubleshooting

- **Upload fails**: ensure the file ends with `.txt` and is under 1MB.
- **Still getting “authentication required”**: re-export cookies after logging in, and make sure you’re exporting from the same browser profile you used to log in.


