//% icon="\uf185" color="#8f1fff" advanced="true"
namespace lantern {
    let bandPalettes: Buffer[];

    // The top row is just the palette, each row gets darker
    const palette_ramps = image.ofBuffer(hex`e4100400ffff0000d1cb0000a2ff0000b3fc0000e4fc000045ce000086fc000067c80000c8ff000069c80000bafc0000cbff0000fcff0000bdfc0000ceff0000ffff0000`);

    export interface LightAnchor {
        x: number;
        y: number;
    }

    export class LightSource {
        anchor: LightAnchor;
        offsetTable: Buffer;
        width: number;
        height: number;

        constructor(public rings: number, public bandWidth: number, public centerRadius: number) {
            const halfh = centerRadius + rings * bandWidth;
            this.offsetTable = pins.createBuffer((rings + 1) * halfh);

            // Approach is roughly based on https://hackernoon.com/pico-8-lighting-part-1-thin-dark-line-8ea15d21fed7
            let x: number;
            let band: number;
            let y2: number;
            for (let y = 0; y < halfh; y++) {
                y2 = Math.pow(y, 2);
                // Store the offsets where the bands switch light levels for each row. We only need to
                // do one quadrant which we can mirror in x/y
                for (band = 0; band < rings; band++) {
                    x = Math.sqrt(Math.pow(centerRadius + bandWidth * (band + 1), 2) - y2) | 0;
                    this.offsetTable[y * rings + band] = x;
                }
            }

            this.width = halfh;
            this.height = halfh;
        }

        apply() {
            const camera = game.currentScene().camera;
            const halfh = this.width;
            const cx = this.anchor.x - camera.drawOffsetX;
            const cy = this.anchor.y - camera.drawOffsetY;

            let prev: number;
            let offset: number;
            let band: number;

            const currentTilemap = game.currentScene().tilemap; // Changed to .tilemap (lowercase t) just in case, though .tileMap should also work.
            const tileWidth = currentTilemap ? currentTilemap.tileWidth : 16; // Corrected: property, not method
            const tileHeight = currentTilemap ? currentTilemap.tileHeight : 16; // Corrected: property, not method

            // Helper to check for wall in a given screen rectangle and return clipped width/x
            const getClippedRect = (x: number, y: number, width: number, isRightHalf: boolean) => {
                if (!currentTilemap) return { x: x, width: width };

                let currentX = x;
                let clippedWidth = width;

                const row = Math.floor(y / tileHeight);
                // Ensure row is within tilemap bounds
                if (row < 0 || row >= currentTilemap.mapRows) { // Corrected: property, not method
                     return { x: x, width: width }; // If row is out of bounds, no clipping based on walls in this row
                }

                if (isRightHalf) { // Moving right from center
                    const endScreenX = x + width;
                    let currentTileCol = Math.floor(x / tileWidth);
                    const endTileCol = Math.floor(endScreenX / tileWidth);

                    for (let col = currentTileCol; col <= endTileCol; col++) {
                        if (col < 0 || col >= currentTilemap.mapColumns) continue; // Corrected: property, not method

                        const tile = currentTilemap.getTile(col, row);
                        if (tile && tile.isWall()) { // Corrected: method on Tile object
                            clippedWidth = Math.max(0, (col * tileWidth) - x);
                            break;
                        }
                    }
                } else { // Moving left from center
                    // x here is the rightmost point of the segment (e.g., cx - prev)
                    // (x + width) is the leftmost point of the segment (e.g., cx - offset)
                    const endScreenX = x + width; // This is actually the left edge of the segment
                    let currentTileCol = Math.floor(x / tileWidth);
                    const endTileCol = Math.floor(endScreenX / tileWidth); // This will be smaller or equal

                    for (let col = currentTileCol; col >= endTileCol; col--) {
                        if (col < 0 || col >= currentTilemap.mapColumns) continue; // Corrected: property, not method

                        const tile = currentTilemap.getTile(col, row);
                        if (tile && tile.isWall()) { // Corrected: method on Tile object
                            // The wall is at col * tileWidth. We need to draw up to the right edge of this wall tile.
                            // The segment starts at 'x' (rightmost) and extends left to 'x + width' (leftmost).
                            // If a wall is found at 'col', the effective leftmost point becomes (col + 1) * tileWidth.
                            // So, the new width is (x - ((col + 1) * tileWidth))
                            const wallRightEdge = (col + 1) * tileWidth;
                            clippedWidth = Math.max(0, x - wallRightEdge);
                            currentX = wallRightEdge; // The new starting X for mapRect
                            break;
                        }
                    }
                }

                return { x: currentX, width: clippedWidth };
            }


            // First, black out the completely dark areas of the screen
            // For robust wall handling here, you'd iterate through tilemap cells and apply darkness.
            // For now, we apply broad black-out and rely on the light bands to "draw over" it.
            screen.fillRect(0, 0, screen.width, cy - halfh + 1, 15)
            screen.fillRect(0, cy - halfh + 1, cx - halfh, halfh << 1, 15)
            screen.fillRect(cx + halfh, cy - halfh + 1, screen.width - cx - halfh + 1, halfh << 1, 15)
            screen.fillRect(0, cy + halfh, screen.width, screen.height - (cy + halfh) + 1, 15)

            // Go over each row and darken the colors
            for (let y = 0; y < halfh; y++) {
                band = this.rings;
                prev = 0;
                offset = this.offsetTable[y * this.rings + band - 1]

                // Black out the region outside the darkest light band
                // Right side, top and bottom
                let clipResult = getClippedRect(cx + offset, cy + y + 1, halfh - offset, true);
                screen.mapRect(clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);
                clipResult = getClippedRect(cx + offset, cy - y, halfh - offset, true);
                screen.mapRect(clipResult.x, cy - y, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);

                // Left side, top and bottom
                // Note: For left side, the 'x' in getClippedRect should be the rightmost point of the segment
                // and 'width' will be negative, representing the extent to the left.
                // screen.mapRect expects positive width, and x as the left-most point.
                // So we pass cx - offset for x, and (cx - prev) - (cx - offset) for width.
                // The `getClippedRect` will return the new leftmost x and the positive width.
                let originalLeftX = cx - halfh; // Not directly used in the current version, kept for context
                let originalWidth = halfh - offset; // This is the total positive width for the segment
                clipResult = getClippedRect(cx - offset, cy + y + 1, -(halfh - offset), false); // Pass negative width to indicate left direction
                screen.mapRect(clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);
                clipResult = getClippedRect(cx - offset, cy - y, -(halfh - offset), false);
                screen.mapRect(clipResult.x, cy - y, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);


                // Darken each concentric circle by remapping the colors
                while (band > 0) {
                    offset = this.offsetTable[y * this.rings + band - 1]
                    if (offset) {
                        offset += (Math.idiv(Math.randomRange(0, 11), 5))
                    }

                    // We reflect the circle-quadrant horizontally and vertically
                    // Right side, top and bottom
                    clipResult = getClippedRect(cx + offset, cy + y + 1, prev - offset, true);
                    screen.mapRect(clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[band - 1]);
                    clipResult = getClippedRect(cx + offset, cy - y, prev - offset, true);
                    screen.mapRect(clipResult.x, cy - y, clipResult.width, 1, bandPalettes[band - 1]);

                    // Left side, top and bottom
                    // Again, adjust parameters for getClippedRect for left segments
                    clipResult = getClippedRect(cx - offset, cy + y + 1, -(prev - offset), false);
                    screen.mapRect(clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[band - 1]);
                    clipResult = getClippedRect(cx - offset, cy - y, -(prev - offset), false);
                    screen.mapRect(clipResult.x, cy - y, clipResult.width, 1, bandPalettes[band - 1]);

                    prev = offset;
                    band--;
                }
            }
        }
    }

    export class LanternEffect implements effects.BackgroundEffect {
        protected sources: LightSource[];
        protected static instance: LanternEffect;
        protected anchor: LightAnchor;
        protected init: boolean;
        protected running: boolean;
        protected breathing: boolean;

        public static getInstance() {
            if (!LanternEffect.instance) LanternEffect.instance = new LanternEffect();
            return LanternEffect.instance;
        }

        private constructor() {
            bandPalettes = [];
            for (let band = 0; band < 6; band++) {
                const buffer = pins.createBuffer(16);
                for (let i = 0; i < 16; i++) {
                    buffer[i] = palette_ramps.getPixel(i, band + 1);
                }
                bandPalettes.push(buffer);
            }

            this.setBandWidth(13);

            this.setAnchor({ x: screen.width >> 1, y: screen.height >> 1 });
            this.running = false;
            this.breathing = true;
        }

        startScreenEffect() {
            this.running = true;

            if (this.init) return;
            this.init = true;

            let index = 0;

            scene.createRenderable(91, () => {
                if (!this.running) return;
                this.sources[index].apply();
            })

            let up = true;

            game.onUpdateInterval(1000, () => {
                if (!this.running) return;
                if (!this.breathing) {
                    index = 1;
                    return;
                }
                if (up) index++;
                else index--;

                if (index < 0) {
                    index = 1;
                    up = true;
                }
                else if (index >= this.sources.length) {
                    index = this.sources.length - 2;
                    up = false;
                }
            })
        }

        stopScreenEffect() {
            this.running = false;
        }

        setAnchor(anchor: LightAnchor) {
            this.anchor = anchor;
            this.sources.forEach((value: LightSource, index: number) => {
                value.anchor = this.anchor;
            });
        }

        setBandWidth(width: number) {
            this.sources = [
                new LightSource(4, width - 1, 2),
                new LightSource(4, width, 1),
                new LightSource(4, width + 1, 2)
            ];

            this.setAnchor(this.anchor)
        }

        setBreathingEnabled(enabled: boolean) {
            this.breathing = enabled;
        }
    }

    export class MultiLightSourceEffect implements effects.BackgroundEffect {
        protected static instance:MultiLightSourceEffect  
        protected sources: LightSource[];
        protected init: boolean;
        protected running: boolean;
        protected breathing: boolean;

        startScreenEffect() :void{
            this.running = true;

            if (this.init) return;
            this.init = true;   

       
            scene.createRenderable(91, () => {
                if (!this.running) return;
                // render according to all light sources 
                // black out all dark area
                

       
            })

        }

        addLightSource(sprite:Sprite, width:number = 13) {
            for (let source of this.sources) {
                // if (source.anchor)
            }
        }

        stopScreenEffect() {
            this.running = false
        }

        private constructor() {
            bandPalettes = [];
            for (let band = 0; band < 6; band++) {
                const buffer = pins.createBuffer(16);
                for (let i = 0; i < 16; i++) {
                    buffer[i] = palette_ramps.getPixel(i, band + 1);
                }
                bandPalettes.push(buffer);
            }

            this.running = false;
            this.breathing = true;
        }

        public static getInstance() {
            if (!MultiLightSourceEffect.instance) MultiLightSourceEffect.instance = new MultiLightSourceEffect();
             return MultiLightSourceEffect.instance;
        }

    }

    //% block
    export function startLanternEffect(anchor: Sprite) {
        if (!anchor) {
            stopLanternEffect();
            return;
        }

        const effect = LanternEffect.getInstance();
        effect.setAnchor(anchor);
        effect.startScreenEffect();
    }

    //% block
    export function stopLanternEffect() {
        LanternEffect.getInstance().stopScreenEffect();
    }

    //% block
    export function setLightBandWidth(width: number) {
        LanternEffect.getInstance().setBandWidth(width);
    }


    //% block
    export function setBreathingEnabled(enabled: boolean) {
        LanternEffect.getInstance().setBreathingEnabled(enabled);
    }


    // multi light source start 
    enum LightSourceMode {
        SINGLE, MULTIPLE
    }


    export function setLightBandWidthOf(sprite:Sprite, width:number) {

    }

    let lightSourceMode = LightSourceMode.SINGLE
  
    export function setLightSourceMode(mode:LightSourceMode) {
        lightSourceMode = mode
    }

}
