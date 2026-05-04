export const openApiSpec = {
    openapi: '3.0.3',
    info: { title: 'TrashFreeHosting API', version: '1.0.0' },
    paths: {
        '/api/v1/auth/register': { post: { summary: 'Register account' } },
        '/api/v1/auth/login': { post: { summary: 'Login' } },
        '/api/v1/auth/refresh': { post: { summary: 'Refresh tokens' } },
        '/api/v1/auth/logout': { post: { summary: 'Logout and revoke refresh token' } },
    },
};
