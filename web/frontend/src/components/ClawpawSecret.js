import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { fetchSecret, generateSecret } from '../services/secretService';
export function ClawpawSecret({ uid }) {
    const [secret, setSecret] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        fetchSecret(uid)
            .then(setSecret)
            .catch(() => setError('Failed to load secret'))
            .finally(() => setLoading(false));
    }, [uid]);
    const handleGenerate = async () => {
        setGenerating(true);
        setError('');
        try {
            const next = await generateSecret(uid);
            setSecret(next);
        }
        catch {
            setError('Failed to generate secret');
        }
        finally {
            setGenerating(false);
        }
    };
    if (loading)
        return _jsx("p", { style: styles.hint, children: "Loading secret\u2026" });
    return (_jsxs("div", { style: styles.container, children: [_jsx("h3", { style: styles.title, children: "Clawpaw Secret" }), secret ? (_jsxs(_Fragment, { children: [_jsx("code", { style: styles.code, children: secret }), _jsx("button", { onClick: handleGenerate, disabled: generating, style: styles.regenBtn, children: generating ? 'Regenerating…' : 'Regen' })] })) : (_jsx("button", { onClick: handleGenerate, disabled: generating, style: styles.generateBtn, children: generating ? 'Generating…' : 'Generate Secret' })), error && _jsx("p", { style: styles.error, children: error })] }));
}
const styles = {
    container: {
        marginTop: '2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
    },
    title: {
        margin: 0,
        fontSize: '1rem',
        color: '#333',
    },
    code: {
        background: '#f4f4f4',
        border: '1px solid #ddd',
        borderRadius: '6px',
        padding: '0.5rem 1rem',
        fontSize: '0.85rem',
        wordBreak: 'break-all',
        maxWidth: '480px',
        textAlign: 'center',
    },
    generateBtn: {
        padding: '0.5rem 1.5rem',
        background: '#4285F4',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.9rem',
    },
    regenBtn: {
        padding: '0.35rem 1rem',
        background: '#fff',
        color: '#555',
        border: '1px solid #ccc',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '0.85rem',
    },
    error: { color: 'red', fontSize: '0.85rem', margin: 0 },
    hint: { color: '#999', fontSize: '0.85rem' },
};
