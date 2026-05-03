const express = require('express');
const { minigameRouter } = require('./minigameGateway');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use('/api/minigame', minigameRouter);

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Minigame reward gateway listening on :${port}`);
});
