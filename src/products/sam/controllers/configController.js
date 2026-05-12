const getPublicConfig = (req, res) => {
  res.json({
    success: true,
    data: {
      mapboxToken: process.env.MAPBOX_TOKEN || ''
    }
  });
};

module.exports = { getPublicConfig };