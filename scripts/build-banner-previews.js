const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {banners} = require('../club-banner-catalog');

module.exports = async function buildBannerPreviews(root, output) {
  const files = Object.values(banners).flatMap(byDay => Object.values(byDay).flat());
  for (const file of new Set(files)) {
    const dest = path.join(output,'assets/banner-previews',file+'.webp');
    await fs.mkdir(path.dirname(dest),{recursive:true});
    const source = path.join(root,'assets/schedule/banners',file);
    await sharp(source).rotate().resize({width:960, withoutEnlargement:true})
      .webp({quality:78}).toFile(dest + '.view.webp');
    await sharp(source)
      .rotate().resize({width:240,withoutEnlargement:true}).webp({quality:62}).toFile(dest);
  }
  for (const file of ['schedule-overview-v2-3.jpg', 'schedule-overview-v2-2.jpg']) {
    await sharp(path.join(root, 'assets/schedule', file))
      .resize({width:480, withoutEnlargement:true}).webp({quality:76})
      .toFile(path.join(output, 'assets/banner-previews', file + '.webp'));
  }
};
