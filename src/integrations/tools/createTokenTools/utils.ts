import {Buffer} from "buffer";
import fs from "fs/promises";
import fetch from "node-fetch";

export async function prepareIpfs({
        name = '',
        symbol = '',
        description = '',
        twitter = '',
        telegram = '',
        website = '',
        imageUrl = '',
        imageData = undefined as Buffer | undefined,
        filePath = ''
    }: {
    name: string,
    symbol: string,
    description?: string,
    twitter?: string,
    telegram?: string,
    website?: string,
    imageUrl?: string,
    imageData?: Buffer,
    filePath?: string
}): Promise<string | null> {
    try {
        if (!imageUrl || !imageUrl.startsWith('https://sapphire-working-koi-276.mypinata.cloud/ipfs/')) {
            if (!imageData && filePath) {
                imageData = await fs.readFile(filePath);
            } else if (!imageData && imageUrl) {
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error('Failed to download image.');
                imageData = Buffer.from(await response.arrayBuffer());
            }

            if (imageData) {
                const boundary = '----WebKitFormBoundarymkE1BAuPXiGrhrdB';
                const bodyParts: Buffer[] = [];

                bodyParts.push(Buffer.from(`--${boundary}\r\n`));
                bodyParts.push(Buffer.from('Content-Disposition: form-data; name="image"; filename="image.jpg"\r\n'));
                bodyParts.push(Buffer.from('Content-Type: image/jpeg\r\n\r\n'));
                bodyParts.push(imageData);
                bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

                const response = await fetch('https://gated.chat/upload/img', {
                    method: 'POST',
                    headers: {
                        'content-type': `multipart/form-data; boundary=${boundary}`,
                        'referrer': 'https://letsbonk.fun/'
                    },
                    body: Buffer.concat(bodyParts)
                });

                const text = await response.text();
                if (response.ok && text.startsWith('https://')) {
                    imageUrl = text.trim();
                } else {
                    try {
                        const json = JSON.parse(text);
                        if (json.url) imageUrl = json.url;
                    } catch (_) {
                        console.error('Invalid image upload response');
                        return null;
                    }
                }
            }

            if (!imageUrl) {
                imageUrl = 'https://sapphire-working-koi-276.mypinata.cloud/ipfs/bafybeihpy352xnqgn74nrjj6bgxndrss5nbqix4kfhwfanoyo766tgwzz4';
            }
        }

        const metadata: Record<string, any> = {
            name,
            symbol,
            description,
            createdOn: 'https://bonk.fun',
            image: imageUrl
        };
        if (twitter) metadata.twitter = twitter;
        if (telegram) metadata.telegram = telegram;
        if (website) metadata.website = website;
        const metaResponse = await fetch('https://gated.chat/upload/meta', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'referrer': 'https://letsbonk.fun/',
                'origin': 'https://letsbonk.fun'
            },
            body: JSON.stringify(metadata)
        });

        const metaText = await metaResponse.text();
        if (metaResponse.ok && metaText.startsWith('https://')) {
            return metaText.trim();
        } else {
            try {
                const json = JSON.parse(metaText);
                return json.url || null;
            } catch (_) {
                console.error('Invalid metadata upload response');
                return null;
            }
        }
    } catch (e) {
        console.log('prepareIpfs error:', e);
        return null;
    }
}