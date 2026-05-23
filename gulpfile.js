const { Buffer } = require('buffer');
const fs = require('fs/promises');
const path = require('path');
const process = require('process');
const sirv = require('sirv-cli');
const { VERSION: SVGO_VERSION } = require('svgo');
const sass = require('sass');
const CleanCSS = require('clean-css');
const vinylMap = require('vinyl-map');
const gulp = require('gulp');
const gulpif = require('gulp-if');
const gulpSass = require('gulp-sass')(sass);
const gulpNunjucks = require('gulp-nunjucks');
const gulpHtmlmin = require('gulp-htmlmin');
const rollup = require('rollup');
const { nodeResolve: rollupResolve } = require('@rollup/plugin-node-resolve');
const rollupCommon = require('@rollup/plugin-commonjs');
const rollupReplace = require('@rollup/plugin-replace');
const { terser: rollupTerser } = require('rollup-plugin-terser');

const IS_DEV_TASK =
  process.argv.includes('dev') || process.argv.includes('--dev');

const buildConfig = {
  cleancss: {
    level: {
      1: {
        specialComments: 0,
      },
      2: {
        all: false,
        mergeMedia: true,
        removeDuplicateMediaBlocks: true,
        removeEmpty: true,
      },
    },
    sourceMap: true,
    sourceMapInlineSources: true,
  },
  htmlmin: {
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: false,
    collapseWhitespace: true,
    decodeEntities: true,
    minifyCSS: false,
    minifyJS: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
  },
  sass: {
    outputStyle: IS_DEV_TASK ? 'expanded' : 'compressed',
  },
  terser: {
    mangle: true,
    compress: {
      passes: 2,
    },
    format: {
      comments: false,
    },
  },
};

const readJSON = async (filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
};

const nunjucks = require('gulp-nunjucks/node_modules/nunjucks');

const FEATURED_PLUGIN_IDS = [
  'removeViewBox',
  'cleanupIds',
  'convertPathData',
  'removeMetadata',
  'mergePaths',
  'removeHiddenElems',
  'inlineStyles',
  'removeDimensions',
];

const resolveRelatedPlugins = (pluginId, plugins, learnContent) => {
  const entry = learnContent[pluginId];
  if (!entry?.related) {
    return [];
  }

  return entry.related
    .map((id) => plugins.find((p) => p.id === id))
    .filter(Boolean)
    .map(withPluginSlug);
};

const validateLearnClusters = (pluginIds, learnClusters) => {
  const assigned = new Map();
  const clusterSlugs = Object.keys(learnClusters);

  for (const slug of clusterSlugs) {
    const entry = learnClusters[slug];
    if (!entry?.title || !entry?.description || !entry?.intro) {
      throw new Error(`learn-clusters.json: "${slug}" needs title, description, and intro`);
    }
    if (!Array.isArray(entry.pluginIds) || entry.pluginIds.length === 0) {
      throw new Error(`learn-clusters.json: "${slug}" needs a non-empty pluginIds array`);
    }
    for (const id of entry.pluginIds) {
      if (!pluginIds.includes(id)) {
        throw new Error(`learn-clusters.json: unknown plugin id "${id}" in "${slug}"`);
      }
      if (assigned.has(id)) {
        throw new Error(
          `learn-clusters.json: "${id}" assigned to both "${assigned.get(id)}" and "${slug}"`,
        );
      }
      assigned.set(id, slug);
    }
  }

  const missing = pluginIds.filter((id) => !assigned.has(id));
  if (missing.length) {
    throw new Error(
      `learn-clusters.json: plugins not assigned to any cluster: ${missing.join(', ')}`,
    );
  }
};

const buildPluginClusterMap = (learnClusters) => {
  const map = new Map();
  for (const [slug, entry] of Object.entries(learnClusters)) {
    for (const pluginId of entry.pluginIds) {
      map.set(pluginId, { slug, ...entry });
    }
  }
  return map;
};

const buildClustersForTemplates = (learnClusters, plugins, learnContent) =>
  Object.entries(learnClusters).map(([slug, entry]) => ({
    slug,
    title: entry.title,
    description: entry.description,
    intro: entry.intro,
    seeAlsoClusterSlugs: entry.seeAlsoClusterSlugs || [],
    clusterPlugins: entry.pluginIds
      .map((id) => {
        const plugin = plugins.find((p) => p.id === id);
        if (!plugin) return null;
        const learn = learnContent[id];
        return {
          plugin,
          summary: learn?.summary || null,
        };
      })
      .filter(Boolean),
  }));

const resolveSeeAlsoClusters = (clusterSlug, learnClusters, clustersForTemplates) => {
  const slugs = learnClusters[clusterSlug]?.seeAlsoClusterSlugs || [];
  return slugs
    .map((slug) => clustersForTemplates.find((c) => c.slug === slug))
    .filter(Boolean)
    .map(({ slug, title }) => ({ slug, title }));
};

const buildBreadcrumbList = (liveBaseUrl, items) =>
  items.map((item) => ({
    name: item.name,
    url: item.url.startsWith('http') ? item.url : `${liveBaseUrl}${item.url.replace(/^\//, '')}`,
  }));

const showPluginCaution = (learn) =>
  Boolean(learn?.caution && !/^None\b/.test(learn.caution));

const buildPluginPageMeta = (plugin) => {
  const pageTitle = `${plugin.name} – SVGO Plugin Guide | SVGOMG`;
  const metaDescription = `When to use SVGO ${plugin.id} (${plugin.name}) on SVGOMG.net. Enable safely, avoid broken SVGs, and optimize in the browser.`;
  return { pageTitle, metaDescription };
};

const buildOgImageUrl = (liveBaseUrl, slug) =>
  `${liveBaseUrl}imgs/og/${slug}.png`;

const { buildOgSvg } = require('./scripts/og-images.js');
const { pluginSlug, withPluginSlug } = require('./scripts/plugin-slug.js');

async function ogImages() {
  const { config } = await loadSiteContext();
  const outDir = path.join(__dirname, 'build', 'imgs', 'og');
  await fs.mkdir(outDir, { recursive: true });

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error(
      'sharp is required to build OG images. Run: npm install --save-dev sharp',
    );
  }

  const targets = [
    { id: 'index', name: 'SVGO Plugin Guide' },
    ...config.plugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
    })),
  ];

  await Promise.all(
    targets.map(async (target) => {
      const svg = buildOgSvg(target);
      const fileSlug = target.id === 'index' ? 'index' : pluginSlug(target.id);
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outDir, `${fileSlug}.png`));
    }),
  );
}

const minifyCss = vinylMap((buffer) => {
  return new CleanCSS(buildConfig.cleancss).minify(buffer.toString()).styles;
});

function copy() {
  return gulp
    .src([
      'src/{.well-known,imgs,test-svgs,fonts}/**',
      // Exclude the test-svgs files except for `car-lite.svg`
      // which is used in the demo
      '!src/test-svgs/!(car-lite.svg)',
      '!src/imgs/maskable.svg',
      'src/*.json',
      'src/ads.txt',
      'src/_headers',
      'src/robots.txt',
    ])
    .pipe(gulp.dest('build'));
}

function css() {
  return gulp
    .src('src/css/*.scss', { sourcemaps: true })
    .pipe(gulpSass.sync(buildConfig.sass).on('error', gulpSass.logError))
    .pipe(gulpif(!IS_DEV_TASK, minifyCss))
    .pipe(gulp.dest('build/', { sourcemaps: '.' }));
}

async function loadSiteContext() {
  const [config, changelog, site] = await Promise.all([
    readJSON(path.join(__dirname, 'src', 'config.json')),
    readJSON(path.join(__dirname, 'src', 'changelog.json')),
    readJSON(path.join(__dirname, 'src', 'site.json')),
  ]);

  return {
    config,
    changelog,
    liveBaseUrl: site.liveBaseUrl,
    iconPath: 'imgs/icon.png',
    SVGOMG_VERSION: changelog[0].version,
    SVGO_VERSION,
  };
}

async function html() {
  const siteContext = await loadSiteContext();
  const headCSS = await fs.readFile(
    path.join(__dirname, 'build', 'head.css'),
    'utf8',
  );

  return gulp
    .src('src/*.html')
    .pipe(
      gulpNunjucks.compile({
        plugins: siteContext.config.plugins.map(withPluginSlug),
        headCSS,
        SVGOMG_VERSION: siteContext.SVGOMG_VERSION,
        SVGO_VERSION: siteContext.SVGO_VERSION,
        liveBaseUrl: siteContext.liveBaseUrl,
        title: 'SVGOMG - Optimize and minify SVG images',
        description:
          'Free online SVG optimizer and minifier. Compress SVG images with SVGO in your browser — no upload required.',
        iconPath: siteContext.iconPath,
        siteToolbarMode: 'tool',
      }),
    )
    .pipe(gulpif(!IS_DEV_TASK, gulpHtmlmin(buildConfig.htmlmin)))
    .pipe(gulp.dest('build'));
}

async function learnHtmlWrite() {
  const { config, liveBaseUrl, iconPath, SVGO_VERSION } = await loadSiteContext();
  const learnContent = await readJSON(
    path.join(__dirname, 'src', 'learn-content.json'),
  );
  const learnClusters = await readJSON(
    path.join(__dirname, 'src', 'learn-clusters.json'),
  );
  const faqItems = await readJSON(path.join(__dirname, 'src', 'learn-faq.json'));
  const pluginIds = config.plugins.map((p) => p.id);
  validateLearnClusters(pluginIds, learnClusters);
  const pluginClusterMap = buildPluginClusterMap(learnClusters);

  const env = nunjucks.configure(path.join(__dirname, 'src'), {
    autoescape: true,
  });

  const plugins = config.plugins.map(withPluginSlug);
  const featuredPlugins = FEATURED_PLUGIN_IDS.map((id) =>
    plugins.find((p) => p.id === id),
  ).filter(Boolean);
  const clustersForTemplates = buildClustersForTemplates(
    learnClusters,
    plugins,
    learnContent,
  );

  await Promise.all(
    plugins.map(async (plugin) => {
      const learn = learnContent[plugin.id] || null;
      const clusterEntry = pluginClusterMap.get(plugin.id);
      const cluster = clusterEntry
        ? {
            slug: clusterEntry.slug,
            title: clusterEntry.title,
          }
        : null;
      const { pageTitle, metaDescription } = buildPluginPageMeta(plugin);
      const canonicalUrl = `${liveBaseUrl}plugins/${plugin.slug}/`;
      const breadcrumbList = buildBreadcrumbList(liveBaseUrl, [
        { name: 'SVGOMG.net', url: '/' },
        { name: 'How to optimize', url: 'how-to-optimize/' },
        ...(cluster
          ? [{ name: cluster.title, url: `guides/${cluster.slug}/` }]
          : []),
        { name: plugin.name, url: canonicalUrl },
      ]);
      const htmlContent = env.render('plugins/plugin.html', {
        plugin,
        learn,
        cluster,
        relatedPlugins: resolveRelatedPlugins(
          plugin.id,
          plugins,
          learnContent,
        ),
        pageTitle,
        metaDescription,
        canonicalUrl,
        liveBaseUrl,
        iconPath,
        ogImageUrl: buildOgImageUrl(liveBaseUrl, plugin.slug),
        breadcrumbList,
        siteToolbarMode: 'content',
        siteToolbarActive: 'plugins',
        showCaution: showPluginCaution(learn),
        SVGO_VERSION,
      });
      const outDir = path.join(__dirname, 'build', 'plugins', plugin.slug);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'index.html'), htmlContent);
    }),
  );

  const pluginsHubCanonical = `${liveBaseUrl}plugins/`;
  const learnIndexHtml = env.render('plugins/index.html', {
    plugins,
    featuredPlugins,
    clusters: clustersForTemplates,
    pageTitle: 'SVGO Plugin Guide – SVGOMG',
    metaDescription:
      'The SVGO Plugin Guide for SVGOMG.net: what each transform does, when to enable it, and how to avoid broken SVG output.',
    canonicalUrl: pluginsHubCanonical,
    liveBaseUrl,
    iconPath,
    ogImageUrl: buildOgImageUrl(liveBaseUrl, 'index'),
    breadcrumbList: buildBreadcrumbList(liveBaseUrl, [
      { name: 'SVGOMG.net', url: '/' },
      { name: 'SVGO Plugin Guide', url: pluginsHubCanonical },
    ]),
    siteToolbarMode: 'content',
    siteToolbarActive: 'plugins',
    SVGO_VERSION,
  });
  await fs.mkdir(path.join(__dirname, 'build', 'plugins'), { recursive: true });
  await fs.writeFile(
    path.join(__dirname, 'build', 'plugins', 'index.html'),
    learnIndexHtml,
  );

  const guidePageTitle = 'How to Optimize SVG Files – SVGOMG';
  const guideMetaDescription =
    'Step-by-step guide to optimizing SVGs with SVGOMG.net and SVGO: settings, features, troubleshooting, and when to use SVG vs raster formats.';
  const guideCanonicalUrl = `${liveBaseUrl}how-to-optimize/`;
  const guideHtml = env.render('how-to-optimize/index.html', {
    plugins,
    featuredPlugins,
    clusters: clustersForTemplates,
    faqItems,
    pageTitle: guidePageTitle,
    metaDescription: guideMetaDescription,
    canonicalUrl: guideCanonicalUrl,
    liveBaseUrl,
    iconPath,
    ogImageUrl: buildOgImageUrl(liveBaseUrl, 'index'),
    breadcrumbList: buildBreadcrumbList(liveBaseUrl, [
      { name: 'SVGOMG.net', url: '/' },
      { name: 'How to optimize', url: guideCanonicalUrl },
    ]),
    siteToolbarMode: 'content',
    siteToolbarActive: 'guide',
    SVGO_VERSION,
  });
  const guideOutDir = path.join(__dirname, 'build', 'how-to-optimize');
  await fs.mkdir(guideOutDir, { recursive: true });
  await fs.writeFile(path.join(guideOutDir, 'index.html'), guideHtml);

  await Promise.all(
    clustersForTemplates.map(async (cluster) => {
      const pageTitle = `${cluster.title} – SVG Optimization | SVGOMG`;
      const canonicalUrl = `${liveBaseUrl}guides/${cluster.slug}/`;
      const seeAlsoClusters = resolveSeeAlsoClusters(
        cluster.slug,
        learnClusters,
        clustersForTemplates,
      );
      const htmlContent = env.render('guides/cluster.html', {
        cluster,
        clusterPlugins: cluster.clusterPlugins,
        seeAlsoClusters,
        pageTitle,
        metaDescription: cluster.description,
        canonicalUrl,
        liveBaseUrl,
        iconPath,
        ogImageUrl: buildOgImageUrl(liveBaseUrl, 'index'),
        breadcrumbList: buildBreadcrumbList(liveBaseUrl, [
          { name: 'SVGOMG.net', url: '/' },
          { name: 'How to optimize', url: 'how-to-optimize/' },
          { name: cluster.title, url: canonicalUrl },
        ]),
        siteToolbarMode: 'content',
        siteToolbarActive: 'guide',
        SVGO_VERSION,
      });
      const outDir = path.join(__dirname, 'build', 'guides', cluster.slug);
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'index.html'), htmlContent);
    }),
  );
}

function learnHtmlMinify() {
  return gulp
    .src([
      'build/plugins/**/*.html',
      'build/how-to-optimize/**/*.html',
      'build/guides/**/*.html',
    ], {
      base: 'build',
      allowEmpty: true,
    })
    .pipe(gulpif(!IS_DEV_TASK, gulpHtmlmin(buildConfig.htmlmin)))
    .pipe(gulp.dest('build'));
}

const learnHtml = gulp.series(learnHtmlWrite, learnHtmlMinify);

async function sitemap() {
  const { config, liveBaseUrl } = await loadSiteContext();
  const learnClusters = await readJSON(
    path.join(__dirname, 'src', 'learn-clusters.json'),
  );
  const clusterUrls = Object.keys(learnClusters).map(
    (slug) => `${liveBaseUrl}guides/${slug}/`,
  );
  const urls = [
    liveBaseUrl,
    `${liveBaseUrl}how-to-optimize/`,
    `${liveBaseUrl}plugins/`,
    ...clusterUrls,
    ...config.plugins.map((p) => `${liveBaseUrl}plugins/${pluginSlug(p.id)}/`),
  ];
  const lastmod = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(
      (loc) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`,
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  await fs.writeFile(path.join(__dirname, 'build', 'sitemap.xml'), xml);
}

const rollupCaches = new Map();

async function js(entry, outputPath) {
  const name = path.basename(path.dirname(entry));
  const changelog = await readJSON(
    path.join(__dirname, 'src', 'changelog.json'),
  );
  const bundle = await rollup.rollup({
    cache: rollupCaches.get(entry),
    input: `src/${entry}`,
    plugins: [
      rollupReplace({
        preventAssignment: true,
        SVGOMG_VERSION: JSON.stringify(changelog[0].version),
      }),
      rollupResolve({ browser: true }),
      rollupCommon({ include: /node_modules/ }),
      // Don't use terser on development
      IS_DEV_TASK
        ? ''
        : rollupTerser(
            name === 'page'
              ? {
                  ...buildConfig.terser,
                  mangle: {
                    properties: {
                      regex: /^_/,
                    },
                  },
                }
              : buildConfig.terser,
          ),
    ],
  });

  rollupCaches.set(entry, bundle.cache);

  await bundle.write({
    sourcemap: true,
    format: 'iife',
    file: `build/${outputPath}/${name}.js`,
  });
}

function clean() {
  return fs.rm('build', { force: true, recursive: true });
}

const allJs = gulp.parallel(
  js.bind(null, 'js/prism-worker/index.js', 'js/'),
  js.bind(null, 'js/gzip-worker/index.js', 'js/'),
  js.bind(null, 'js/svgo-worker/index.js', 'js/'),
  js.bind(null, 'js/sw/index.js', ''),
  js.bind(null, 'js/page/index.js', 'js/'),
);

const learnPages = gulp.series(
  ogImages,
  learnHtmlWrite,
  learnHtmlMinify,
  sitemap,
);

const mainBuild = gulp.parallel(
  gulp.series(css, html),
  learnPages,
  allJs,
  copy,
);

function watch() {
  gulp.watch(['src/css/**/*.scss'], gulp.series(css, html));
  gulp.watch(['src/js/**/*.js'], allJs);
  gulp.watch(
    [
      'src/**/*.{html,svg,woff2}',
      'src/*.json',
      'src/plugins/**/*.html',
      'src/how-to-optimize/**/*.html',
      'src/partials/**/*.html',
    ],
    gulp.parallel(html, learnPages, copy, allJs),
  );
}

function serve() {
  sirv('build', {
    host: 'localhost',
    port: 8080,
    dev: true,
    clear: false,
  });
}

exports.clean = clean;
exports.allJs = allJs;
exports.css = css;
exports.html = html;
exports.ogImages = ogImages;
exports.learnHtml = learnHtml;
exports.sitemap = sitemap;
exports.copy = copy;
exports.build = mainBuild;

exports['clean-build'] = gulp.series(clean, mainBuild);

exports.dev = gulp.series(clean, mainBuild, gulp.parallel(watch, serve));
