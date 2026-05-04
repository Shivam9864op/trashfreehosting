import { v4 as uuidv4 } from 'uuid';
export function requestIdMiddleware(req, res, next) {
    const incoming = req.header('x-request-id');
    req.requestId = incoming ?? uuidv4();
    res.setHeader('x-request-id', req.requestId);
    next();
}
