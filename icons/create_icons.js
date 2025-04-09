// This is a simple Node.js script to create placeholder icons
// You can replace these with actual icons later

const fs = require('fs');
const { createCanvas } = require('canvas');

// Create icons directory if it doesn't exist
if (!fs.existsSync('./icons')) {
  fs.mkdirSync('./icons');
}

// Sizes for the icons
const sizes = [16, 48, 128];

// Create each icon
sizes.forEach(size => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#6200ea';
  ctx.fillRect(0, 0, size, size);

  // Cookie shape
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.4, 0, 2 * Math.PI);
  ctx.fill();

  // Cookie bites
  ctx.fillStyle = '#6200ea';
  const biteSize = size * 0.1;
  // Top bite
  ctx.beginPath();
  ctx.arc(size / 2, size * 0.3, biteSize, 0, 2 * Math.PI);
  ctx.fill();
  // Right bite
  ctx.beginPath();
  ctx.arc(size * 0.7, size / 2, biteSize, 0, 2 * Math.PI);
  ctx.fill();

  // Convert to PNG buffer
  const buffer = canvas.toBuffer('image/png');
  
  // Save the file
  fs.writeFileSync(`./icons/icon${size}.png`, buffer);
  
  console.log(`Created icon${size}.png`);
});

console.log('All icons created successfully!'); 