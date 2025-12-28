// Import required modules
const fs = require('fs'); // File system module for file operations
const path = require('path'); // Path module for handling file paths
const jsdom = require('jsdom'); // jsdom module for DOM manipulation
const { JSDOM } = jsdom; // Destructuring JSDOM for ease of use
const marked = require('marked').marked; // Importing marked library for Markdown to HTML conversion

// Custom renderer to add target="_blank" to external links
const renderer = new (require('marked').Renderer)();
const linkRenderer = renderer.link;
renderer.link = (href, title, text) => {
    const html = linkRenderer.call(renderer, href, title, text);
    const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
    return isExternal ? html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer nofollow" ') : html;
};

const scriptDir = path.resolve(__dirname); // Get the directory of the current script
const rootDir = path.resolve(scriptDir, '..'); // Get the root directory by going up one level

/**
 * Extracts front matter from the content and removes it from the content.
 * @param {string} content - The Markdown content with front matter
 * @returns {Object} An object containing front matter and the cleaned content
 */
function extractFrontMatter(content) {
    const frontMatterRegex = /^---\s*[\r\n]+([\s\S]*?)\s*[\r\n]+---/;
    const match = content.match(frontMatterRegex);
    let frontMatter = {};
    if (match) {
        match[1].trim().split('\n').forEach(line => {
            const [key, value] = line.split(':').map(s => s.trim());
            frontMatter[key] = value;
        });
        // Remove the front matter block from the content
        content = content.replace(frontMatterRegex, '');
    }
    return { frontMatter, content };
}

/**
 * Formats a file name into a readable title
 * @param {string} fileName - The name of the file to format
 * @returns {string} The formatted title
 */
function formatTitle(fileName) {
    return fileName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Converts Markdown content to HTML
 * @param {string} content - Markdown content
 * @param {string} title - Title for the HTML document
 * @returns {string} The converted HTML content
 */
function convertMarkdownToHtml(content, title) {
    const templateHtml = fs.readFileSync(path.join(scriptDir, '/templates/main.html'), 'utf8');
    const dom = new JSDOM(templateHtml);
    const document = dom.window.document;

    const titleElement = document.querySelector('title');
    titleElement.textContent = title;

    const ogTitle = document.querySelector('meta[property="og:title"]');
    ogTitle.setAttribute('content', title);

    const twitterTitle = document.querySelector('meta[property="twitter:title"]');
    twitterTitle.setAttribute('content', title);

    const htmlContent = marked(content, { renderer });

    const markdownElement = document.getElementById('markdown-content');
    markdownElement.innerHTML = htmlContent;

    const finalHtml = dom.serialize();
    return finalHtml;
}

// Define directories for Markdown files and output HTML files
const markdownDirectory = path.join(scriptDir, '/markdown');
const outputDirectory = path.join(rootDir, '/public/blog');

// Read and process each Markdown file in the directory
fs.readdirSync(markdownDirectory).forEach(file => {
    if (path.extname(file) === '.md') {
        const markdownFilePath = path.join(markdownDirectory, file);
        let markdownContent = fs.readFileSync(markdownFilePath, 'utf8');

        let { frontMatter, content } = extractFrontMatter(markdownContent);
        const title = frontMatter.title || formatTitle(path.basename(file, '.md'));

        const htmlContent = convertMarkdownToHtml(content, title);

        const outputFileName = path.basename(file, '.md') + '.html';
        const outputFilePath = path.join(outputDirectory, outputFileName);

        fs.writeFileSync(outputFilePath, htmlContent);
    }
});