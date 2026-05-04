export const validate = (schema) => (req, res, next) => {
    const parsed = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!parsed.success) {
        return res.status(422).json({ message: 'Validation failed', errors: parsed.error.flatten() });
    }
    next();
};
