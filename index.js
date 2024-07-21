const express = require('express');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const cheerio = require('cheerio');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const { spawn } = require("child_process");
ffmpeg.setFfmpegPath(ffmpegPath);
const libraryPath = path.join(__dirname, 'library.json');

const app = express();
const port = 8761;

const savelink = {
    finalUrl: null,
    async saveAndTransfer(finalUrl) {
        try {
            this.finalUrl = finalUrl;
            console.log('Saved final URL:', this.finalUrl);

            const transferResponse = { data: 'Transfer simulation response' }; // Simulated response

            console.log('Transfer response:', transferResponse.data);

            this.clear();

            return transferResponse.data;
        } catch (error) {
            console.error('Error:', error);
            throw error;
        }
    },
    clear() {
        this.finalUrl = null;
        console.log('Cleared final URL.');
    },
};

async function downloadAndUploadMusic(youtubeUrl) {
    try {
        const response = { data: { data: { link: 'mock_link', title: 'mock_title' } } }; // Simulated response
        const { link, title } = response.data.data;

        const audioStream = { pipe: () => null }; // Simulated stream

        const titleSanitized = title.replace(/[^a-zA-Z0-9]/g, '_');
        const inputFilePath = path.resolve(__dirname, `geometrydashcontentmusicreupload.mp3`);
        const outputFilePath = path.resolve(__dirname, `gdpsconverted.m4a`);

        const audioFile = fs.createWriteStream(inputFilePath);
        audioStream.pipe(audioFile);

        await new Promise((resolve, reject) => {
            audioFile.on('finish', resolve);
            audioFile.on('error', reject);
        });

        console.log(`Downloaded audio: ${inputFilePath}`);

        await convertMp3ToM4a(inputFilePath, outputFilePath);
        console.log(`Converted to ${outputFilePath}`);

        const instance = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
            baseURL: 'https://www.cjoint.com/',
        });
        const uploadUrl = await getUploadUrl(instance);
        const uploadResponse = await uploadFile(outputFilePath, uploadUrl, instance);
        const cjointLink = await getCjointLink(uploadResponse);
        console.log('cjoint.com link:', cjointLink);

        const finalUrl = await getFinalUrl(cjointLink);
        console.log('Final URL:', finalUrl);

        const transferResponse = await savelink.saveAndTransfer(finalUrl);

        // Add the song info to the library
        addToLibrary({ title, finalUrl });

        fs.unlink(inputFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('MP3 file deleted successfully');
            }
        });

        fs.unlink(outputFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('M4A file deleted successfully');
            }
        });

        return transferResponse;

    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

function convertMp3ToM4a(input, output) {
    return new Promise((resolve, reject) => {
        ffmpeg(input)
            .toFormat('mp3')
            .on('end', resolve)
            .on('error', reject)
            .save(output);
    });
}

async function convertMp4ToMp3(input, output) {
    return new Promise((resolve, reject) => {
        ffmpeg(input)
            .toFormat('mp3')
            .on('end', resolve)
            .on('error', reject)
            .save(output);
    });
}

async function getUploadUrl(instance) {
    const response = await instance.get('/');
    const $ = cheerio.load(response.data);
    return $('#form-upload').attr('action');
}

async function uploadFile(filePath, uploadUrl, instance) {
    const formData = new FormData();
    formData.append('USERFILE', fs.createReadStream(filePath));

    const response = await instance.post(uploadUrl, formData, {
        headers: formData.getHeaders(),
    });
    return response.data;
}

async function getCjointLink(uploadResponse) {
    const $ = cheerio.load(uploadResponse);
    const link = $('.share_url a').attr('href');
    return link;
}

async function getFinalUrl(cjointLink) {
    const instance = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
        baseURL: cjointLink,
    });

    try {
        const htmlResponse = await instance.get('/');
        const html$ = cheerio.load(htmlResponse.data);
        const shareUrl = html$('.share_url a').attr('href');
        const finalUrl = `https://www.cjoint.com${shareUrl.split('"')[0]}`;
        return finalUrl;
    } catch (error) {
        console.error('Error getting final URL:', error);
        throw error;
    }
}

app.get('/api/uploadsong', async (req, res) => {
    const youtubeUrl = req.query.url;
    if (!youtubeUrl) {
        return res.status(400).send('YouTube URL is required.');
    }

    try {
        const transferResponse = await downloadAndUploadMusic(youtubeUrl);
        res.json({ message: 'success', finalUrl });
    } catch (error) {
        res.status(500).send('An error occurred while processing the song.');
    }
});

app.get('/api/library', async (req, res) => {
    try {
        const data = await fs.promises.readFile(libraryPath, 'utf8');
        const library = JSON.parse(data);
        res.json(library);
    } catch (error) {
        console.error('Error reading library:', error);
        res.status(500).send('Error reading library');
    }
});

function addToLibrary(data) {
    let library = [];

    if (fs.existsSync(libraryPath)) {
        const existingData = fs.readFileSync(libraryPath, 'utf8');
        library = JSON.parse(existingData);
    }

    library.push(data);

    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2), 'utf8');
}

app.get('/api/download', async (req, res) => {
    const tiktokUrl = req.query.url;
    if (!tiktokUrl) {
        return res.status(400).send('TikTok URL is required.');
    }

    try {
        const response = await axios.post('https://www.tikwm.com/api/', { url: tiktokUrl });
        const data = response.data.data;
        const videoStream = await axios({
            method: 'get',
            url: data.play,
            responseType: 'stream'
        }).then(res => res.data);

        const title = data.title.replace(/[^a-zA-Z0-9]/g, '_');
        const videoFileName = `${title}.mp4`;
        const videoFilePath = path.resolve(__dirname, videoFileName);
        const videoFile = fs.createWriteStream(videoFilePath);
        videoStream.pipe(videoFile);

        await new Promise((resolve, reject) => {
            videoFile.on('finish', resolve);
            videoFile.on('error', reject);
        });

        console.log(`Downloaded TikTok video: ${videoFilePath}`);

        const audioFileName = `${title}.mp3`;
        const audioFilePath = path.resolve(__dirname, audioFileName);
        await convertMp4ToMp3(videoFilePath, audioFilePath);
        console.log(`Converted TikTok video to MP3: ${audioFilePath}`);

        const instance = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
            baseURL: 'https://www.cjoint.com/',
        });
        const uploadUrl = await getUploadUrl(instance);
        const uploadResponse = await uploadFile(audioFilePath, uploadUrl, instance);
        const cjointLink = await getCjointLink(uploadResponse);
        console.log('cjoint.com link:', cjointLink);

        const finalUrl = await getFinalUrl(cjointLink);
        console.log('Final URL:', finalUrl);

        const transferResponse = await savelink.saveAndTransfer(finalUrl);

        fs.unlink(videoFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('Original video file deleted successfully');
            }
        });

        fs.unlink(audioFilePath, (err) => {
            if (err) {
                console.error('Error deleting file:', err);
            } else {
                console.log('Converted audio file deleted successfully');
            }
        });

        res.json({ message: 'success', transferResponse, finalUrl });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('An error occurred while processing the TikTok video.');
    }
});

app.get('/jonell/upload', async (req, res) => {
    const { url, author, title } = req.query;

    if (!url || !author || !title) {
        return res.status(400).json({ error: 'Missing url, author, or title' });
    }

    try {
        console.log(`Submitting form with URL: ${url}, Title: ${title}, Author: ${author}`);
        const urlsong = url;

        const fetchFormAndSubmit = async () => {
            try {
                const getResponse = await axios.get('https://geodash.click/dashboard/reupload/songAdd.php', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                });

                const $ = cheerio.load(getResponse.data);

                const formData = new URLSearchParams();
                formData.append('url', urlsong);
                formData.append('title', title);
                formData.append('author', author);

                const postResponse = await axios.post('https://geodash.click/dashboard/reupload/songAdd.php', formData.toString(), {
                    headers: {
                        'User-Agent': 'Mozilla/5.0',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });

                const $post = cheerio.load(postResponse.data);

                let responseJson = {};

                const successMessage = $post('p:contains("Song Reuploaded:")').text();
                if (successMessage) {
                    const songId = successMessage.match(/Song Reuploaded: (\d+)/)[1];
                    responseJson.songid = songId;
                    // Add to library

                    fs.writeFileSync(libraryPath, JSON.stringify(library, null, 2));
                } else {
                    const errorMessage = $post('p:contains("An error has occured:")').text();
                    if (errorMessage.includes("-3")) {
                        responseJson.error = "This song has been reuploaded already";
                    } else if (errorMessage.includes("-2")) {
                        responseJson.error = "Invalid URL";
                    } else {
                        responseJson.error = "An unknown error has occurred";
                    }
                }

                return responseJson;
            } catch (error) {
                console.error(error);
                throw error;
            }
        };

        const result = await fetchFormAndSubmit();
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: 'Failed to submit form' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
