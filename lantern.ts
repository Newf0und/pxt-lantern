// (Inside the LightSource class, within the apply() method)

apply();
    {
    const camera = game.currentScene().camera;
    const halfh = this.width;
    const cx = this.anchor.x - camera.drawOffsetX;
    const cy = this.anchor.y - camera.drawOffsetY;

    // ... (existing code for blacking out far areas) ...

    // Get the current tilemap
    const tilemap = game.currentScene().tilemap;

    // Go over each row and darken the colors
    for (let y = 0; y < halfh; y++) {
        // ... (existing code to calculate offset and band) ...

        // Iterate over the horizontal span for each band
        // For each pixel (px, py) within the light's reach:
        // You would need to check line-of-sight to (px, py) from (cx, cy)
        // using a function that checks for wall tiles.

        // Example (conceptual, not runnable code):
        for (let xOffset = 0; xOffset < halfh; xOffset++) {
            const currentPixelX = cx + xOffset; // Or cx - xOffset
            const currentPixelY = cy + y;       // Or cy - y

            // Convert screen coordinates to tilemap coordinates
            const tileCol = Math.floor(currentPixelX / tilemap.tileWidth());
            const tileRow = Math.floor(currentPixelY / tilemap.tileHeight());

            // Check if the current pixel is within the tilemap bounds
            if (tileCol >= 0 && tileCol < tilemap.width && tileRow >= 0 && tileRow < tilemap.height) {
                const tile = tilemap.getTile(tileCol, tileRow);

                // Assuming you have a way to identify "wall" tiles
                if (tile && tile.isWall()) { // You'd need to define how 'isWall()' works
                    // This pixel is a wall, so light stops here.
                    // You'd need to adjust the drawing calls (fillRect, mapRect)
                    // to only draw up to this point. This is the hardest part.
                    // It means you can't just apply a global rectangle mapping;
                    // you'd need to apply pixel-by-pixel or small segment by segment.
                } else {
                    // Apply light normally
                    // screen.mapRect(...) or screen.setPixel(...)
                }
            }
        }
    }
}

// You would need a way to mark tiles as walls. For example, by using a specific kind
// of tile, or by setting a property on the tile, or using the built-in tilemap walls.
// MakeCode Arcade's `setWall()` function on `Tilemap` can be used.
// e.g., game.currentScene().tilemap.setWall(col, row, true);
