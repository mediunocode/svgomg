/** Kebab-case URL slug for an SVGO plugin id (camelCase). */
const pluginSlug = (id) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

const withPluginSlug = (plugin) => ({ ...plugin, slug: pluginSlug(plugin.id) });

module.exports = { pluginSlug, withPluginSlug };
