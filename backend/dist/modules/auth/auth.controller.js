import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { getDb } from '../../config/db.js';
const sign = (u) => jwt.sign({ sub: u.id, username: u.username, discordId: u.discordId }, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES_IN });
export function discordLoginUrl(_req, res) {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI)
        return res.status(500).json({ error: 'Discord OAuth not configured' });
    const url = new URL('https://discord.com/api/oauth2/authorize');
    url.searchParams.set('client_id', env.DISCORD_CLIENT_ID);
    url.searchParams.set('redirect_uri', env.DISCORD_REDIRECT_URI);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify');
    res.json({ url: url.toString() });
}
export async function discordCallback(req, res) {
    const { code } = req.query;
    if (!code || typeof code !== 'string')
        return res.status(400).json({ error: 'Missing code' });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID ?? '', client_secret: env.DISCORD_CLIENT_SECRET ?? '', grant_type: 'authorization_code', code, redirect_uri: env.DISCORD_REDIRECT_URI ?? '' }) });
    const tokenJson = await tokenRes.json();
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokenJson.access_token}` } });
    const discordUser = await userRes.json();
    const db = await getDb();
    const users = db.collection('users');
    await users.updateOne({ discordId: discordUser.id }, { $set: { username: discordUser.username, avatar: discordUser.avatar, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), coins: 0, servers: [] } }, { upsert: true });
    const user = await users.findOne({ discordId: discordUser.id });
    const token = sign({ id: String(user._id), username: discordUser.username, discordId: discordUser.id });
    res.redirect(`${env.FRONTEND_ORIGIN}?token=${encodeURIComponent(token)}`);
}
export async function me(req, res) {
    const user = await (await getDb()).collection('users').findOne({ _id: new (await import('mongodb')).ObjectId(req.user.sub) });
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    res.json({ username: user.username, avatar: user.avatar, coins: user.coins ?? 0, serverCount: Array.isArray(user.servers) ? user.servers.length : 0, discordId: user.discordId });
}
export function logout(_req, res) { res.status(204).send(); }
