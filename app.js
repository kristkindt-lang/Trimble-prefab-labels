/* Trimble Connect Workspace API - eerste prototype.
   Filters object properties named Layer = BALK and VEstuk_Nr = label text.
   Note: test on a representative Tekla/IFC model before production use. */
let API = null;
let appMarkupIds = [];
const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; };

function allProps(object) {
  const result = [];
  for (const set of (object.properties || [])) {
    for (const prop of (set.properties || [])) result.push(prop);
  }
  return result;
}
function findValue(object, wantedName) {
  const wanted = wantedName.toLowerCase();
  const p = allProps(object).find(x => String(x.name || '').toLowerCase() === wanted);
  return p ? p.value : undefined;
}

async function connect() {
  try {
    if (!window.TrimbleConnectWorkspace) throw new Error('Workspace API script kon niet geladen worden.');
    API = await window.TrimbleConnectWorkspace.connect(window.parent, (event, data) => {
      console.log('[Prefab labels]', event, data);
    });
    status('Verbonden met Trimble Connect. Open een model in de 3D Viewer.');
  } catch (e) {
    status('Verbinding mislukt: ' + e.message);
  }
}

async function removeOwnLabels() {
  if (!API) throw new Error('Niet verbonden met Trimble Connect.');
  if (!appMarkupIds.length) {
    status('Er zijn in deze sessie nog geen labels geplaatst.');
    return;
  }
  await API.markup.removeMarkups(appMarkupIds);
  const count = appMarkupIds.length;
  appMarkupIds = [];
  status(`${count} label(s) verwijderd.`);
}

async function showLabels() {
  if (!API) throw new Error('Niet verbonden met Trimble Connect.');
  $('show').disabled = true;
  try {
    await removeOwnLabels();
    status('Modellen en objecteigenschappen ophalen…');
    const models = await API.viewer.getModels('loaded');
    if (!models || !models.length) throw new Error('Geen geladen model gevonden. Laad eerst een model in de 3D Viewer.');

    const markups = [];
    let foundLayer = 0, foundLabel = 0, checked = 0, missingBox = 0;
    for (const model of models) {
      const modelId = model.id;
      const modelLayers = await API.viewer.getLayers(modelId).catch(() => []);
      console.log('Model layers:', modelId, modelLayers);
      const modelObjects = await API.viewer.getObjects();
      const group = (modelObjects || []).find(g => g.modelId === modelId);
      const objects = group ? (group.objects || []) : [];
      checked += objects.length;
      const candidates = [];
      for (const obj of objects) {
        const layer = findValue(obj, 'Layer');
        if (String(layer ?? '').trim().toUpperCase() !== 'BALK') continue;
        foundLayer++;
        const label = findValue(obj, 'VEstuk_Nr');
        if (label === undefined || label === null || String(label).trim() === '') continue;
        foundLabel++;
        candidates.push({ id: obj.id, text: String(label).trim() });
      }
      if (!candidates.length) continue;

      // API bounding boxes are returned per runtime object ID.
      const boxes = await API.viewer.getObjectBoundingBoxes(modelId, candidates.map(x => x.id));
      const byId = new Map((boxes || []).map(b => [b.id, b.boundingBox]));
      for (const candidate of candidates) {
        const box = byId.get(candidate.id);
        if (!box || !box.min || !box.max) { missingBox++; continue; }
        const x = (box.min.x + box.max.x) / 2 * 1000;
        const y = (box.min.y + box.max.y) / 2 * 1000;
        const z = (box.min.z + box.max.z) / 2 * 1000;
        const pick = { type: 'point', modelId, objectId: candidate.id, positionX: x, positionY: y, positionZ: z };
        markups.push({ start: pick, end: { ...pick }, text: candidate.text });
      }
    }

    if (!markups.length) {
      status(`Geen labels geplaatst.\nObjecten gecontroleerd: ${checked}\nLayer = BALK gevonden: ${foundLayer}\nMet VEstuk_Nr: ${foundLabel}\nZonder bounding box: ${missingBox}\n\nControleer of de model-eigenschap exact 'Layer' heet en de waarde 'BALK' bevat. Bekijk zo nodig de console (F12).`);
      return;
    }
    const created = await API.markup.addTextMarkup(markups);
    appMarkupIds = (created || []).map(m => m.id).filter(id => id !== undefined && id !== null);
    status(`${created.length} label(s) geplaatst.\nObjecten gecontroleerd: ${checked}\nLayer = BALK: ${foundLayer}\nMet VEstuk_Nr: ${foundLabel}\nZonder bounding box: ${missingBox}`);
  } catch (e) {
    console.error(e);
    status('Fout: ' + (e?.message || String(e)) + '\n\nControleer of een model geladen is en of de API-toegang actief is.');
  } finally {
    $('show').disabled = false;
  }
}

$('show').addEventListener('click', showLabels);
$('clear').addEventListener('click', async () => {
  try { await removeOwnLabels(); } catch (e) { status('Fout: ' + e.message); }
});
connect();
