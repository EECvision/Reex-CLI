const currentParams = {
    'items.0.title': 'book',
    'items.0.quantity': '3',
    'items.0.amount': '5'
};

const payload = {};
const leafPaths = Object.keys(currentParams);

leafPaths.forEach(path => {
    const pathParts = path.split('.');
    let current = payload;

    for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part]) {
            current[part] = isNaN(Number(pathParts[i+1])) ? {} : [];
        }
        current = current[part];
    }

    const lastPart = pathParts[pathParts.length - 1];
    current[lastPart] = currentParams[path];
});

console.log(JSON.stringify(payload, null, 2));
