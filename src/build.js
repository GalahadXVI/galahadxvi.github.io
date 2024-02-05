// Import required modules
const fs = require('fs'); // File system module for reading and writing files
const path = require('path'); // Path module for handling file paths
const jsdom = require('jsdom'); // jsdom module for DOM manipulation
const { JSDOM } = jsdom; // Destructuring JSDOM for ease of use
const execSync = require('child_process').execSync; // For executing shell commands synchronously
const hljs = require('highlight.js/lib/core');
hljs.registerLanguage('javascript', require('highlight.js/lib/languages/javascript'));
hljs.registerLanguage('php', require('highlight.js/lib/languages/php'));

/**
 * Extracts front matter from the content and removes it from the content.
 * @param {string} content - The HTML content with front matter
 * @returns {Object} An object containing front matter and the cleaned content
 */
function extractFrontMatter(content) {
    // Regular expression to match the front matter block
    const frontMatterRegex = /^---\s*[\r\n]+([\s\S]*?)\s*[\r\n]+---/;
    const match = content.match(frontMatterRegex);
    let frontMatter = {};

    if (match) {
        // Parse the front matter content into a key-value pair object
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
 * Processes an HTML file by applying a template and updating its title.
 * @param {string} filePath - Path to the HTML file
 * @param {string} template - HTML template content
 * @returns {string} The processed HTML content
 */
function processHtmlFile(filePath, template) {
    // Read the file content
    let fileContent = fs.readFileSync(filePath, 'utf8');
    // Extract front matter and clean content
    let { frontMatter, content } = extractFrontMatter(fileContent);

    // Create a JSDOM instance with the template
    const dom = new JSDOM(template);
    const document = dom.window.document;

    // Set the page title from front matter if available
    if (frontMatter.title) {
        const titleElement = document.querySelector('title');
        titleElement.textContent = frontMatter.title;
    }

    // Insert the content into the template's designated area
    const contentElement = document.getElementById('page-content');
    contentElement.innerHTML = content;

    // Serialize the DOM to a string (final HTML)
    return dom.serialize();
}

/**
 * Main function to execute the build process.
 */
function build() {
    // Read the HTML template file
    const templateHtml = fs.readFileSync('templates/main.html', 'utf8');
    const pagesDirectory = 'pages';
    const publicDirectory = '../public';

    // Process each HTML file in the pages directory
    fs.readdirSync(pagesDirectory).forEach(file => {
        if (path.extname(file) === '.html') {
            const filePath = path.join(pagesDirectory, file);
            const finalHtml = processHtmlFile(filePath, templateHtml);

            // Write the processed HTML to the output directory
            const outputFilePath = path.join(publicDirectory, file);
            fs.writeFileSync(outputFilePath, finalHtml);
        }
    });

    // Run the markdown render script
    execSync('node render-markdown.js', { stdio: 'inherit' });
}

// Execute the build process
build();