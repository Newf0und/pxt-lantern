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

            const tilemap = game.currentScene().tileMap;
            const tileWidth = tilemap ? tilemap.tileWidth() : 16; // Default to 16 if no tilemap
            const tileHeight = tilemap ? tilemap.tileHeight() : 16; // Default to 16 if no tilemap

            // Helper to check for wall in a given screen rectangle and return clipped width/x
            const getClippedRect = (x: number, y: number, width: number, isRightHalf: boolean) => {
                if (!tilemap) return { x: x, width: width };

                let currentX = x;
                let clippedWidth = width;

                // Determine the direction of checking walls
                const xIncrement = isRightHalf ? 1 : -1;
                const startCol = Math.floor(currentX / tileWidth);
                const endCol = Math.floor((currentX + width * xIncrement) / tileWidth); // This needs to be carefully handled for left/right

                const row = Math.floor(y / tileHeight);

                if (isRightHalf) { // Moving right from center
                    for (let col = startCol; col < Math.floor((x + width) / tileWidth); col++) {
                        if (col < 0 || col >= tilemap.mapColumns() || row < 0 || row >= tilemap.mapRows()) continue; // Out of bounds
                        if (tilemap.isWall(col, row)) {
                            clippedWidth = Math.max(0, (col * tileWidth) - x);
                            break;
                        }
                    }
                } else { // Moving left from center
                    for (let col = startCol; col >= Math.floor((x + width) / tileWidth); col--) { // Width is negative for left
                        if (col < 0 || col >= tilemap.mapColumns() || row < 0 || row >= tilemap.mapRows()) continue; // Out of bounds
                        if (tilemap.isWall(col, row)) {
                            // The wall is at col * tileWidth, so we need to draw up to that point
                            // currentX is cx - prev, and we need to draw to cx - offset
                            // The wall is encountered moving left.
                            // So if wall is at col, then we draw from wall + 1 to original start
                            clippedWidth = Math.max(0, (x + width) - ((col + 1) * tileWidth));
                            currentX = (col + 1) * tileWidth;
                            break;
                        }
                    }
                }

                return { x: currentX, width: clippedWidth };
            }


            // First, black out the completely dark areas of the screen
            // These should also respect walls. This is more complex as it involves larger rectangles.
            // For simplicity in this example, we'll apply wall clipping to the light bands,
            // and assume the initial black-out is a broad stroke that gets refined by the light.
            // A more robust solution for black-out would involve iterating through tiles.
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
                clipResult = getClippedRect(cx - halfh, cy + y + 1, halfh - offset, false);
                screen.mapRect(cx - clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);
                clipResult = getClippedRect(cx - halfh, cy - y, halfh - offset, false);
                screen.mapRect(cx - clipResult.x, cy - y, clipResult.width, 1, bandPalettes[bandPalettes.length - 1]);


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
                    clipResult = getClippedRect(cx - prev, cy + y + 1, prev - offset, false);
                    screen.mapRect(cx - clipResult.x, cy + y + 1, clipResult.width, 1, bandPalettes[band - 1]);
                    clipResult = getClippedRect(cx - prev, cy - y, prev - offset, false);
                    screen.mapRect(cx - clipResult.x, cy - y, clipResult.width, 1, bandPalettes[band - 1]);

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
