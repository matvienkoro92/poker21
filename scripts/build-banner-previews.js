const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {banners} = require('../club-banner-catalog');

module.exports = async function buildBannerPreviews(root, output) {
  const files = Object.values(banners).flatMap(byDay => Object.values(byDay).flat());
  for (const file of new Set(files)) {
    const dest = path.join(output,'assets/banner-previews',file+'.webp');
    await fs.mkdir(path.dirname(dest),{recursive:true});
    await sharp(path.join(root,'assets/schedule/banners',file))
      .rotate().resize({width:300,withoutEnlargement:true}).webp({quality:76}).toFile(dest);
  }
};
