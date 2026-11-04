/* Trimble Connect Workspace API - prototype v1.1
   Important: object properties are fetched with getObjectProperties(),
   using the runtime IDs returned by getObjects().
   Layer is expected as property 'Layer' (usually in set 'Presentation Layers').
*/
let API = null;
let appMarkupIds = [];
const $ = (id) => document.getElementById(id);
const status = (msg) => { $('status').textContent = msg; };

function allProps(object) {
  const result = [];
  for (const set of (object?.properties || [])) {
    for (const prop of (set?.properties || [])) {
      result.push({ ...prop, _setName: set.name || '' });
    }
  }
  return result;
}
function findValue(object, wantedName) {
  const wanted = wantedName.toLowerCase();
  const p = allProps(object).find(x => String(x.name || '').trim().toLowerCase() === wanted);
  return p ? p.value : undefined;
}
function chunks(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) result.push(array.slice(i, i + size));
  return result;
}

async function connect() {
  try {
    if (!window.TrimbleConnectWorkspace) throw new Error('Workspace API script kon niet geladen worden.');
    API = await window.TrimbleConnectWorkspace.connect(window.parent, (event, data) => {
      console.log('[Prefab labels]', event, data);
    });
    status('Verbonden met Trimble Connect. Laad een model in de 3D Viewer en klik op Toon stuknummers.');
  } catch (e) {
    status('Verbinding mislukt: ' + e.message);
  }
}

async function removeOwnLabels() {
  if (!API) throw new Error('Niet verbonden met Trimble Connect.');
  if (!appMarkupIds.length) return;
  await API.markup.removeMarkups(appMarkupIds);
  appMarkupIds = [];
}

async function showLabels() {
  if (!API) throw new Error('Niet verbonden met Trimble Connect.');
  $('show').disabled = true;
  try {
    await removeOwnLabels();
    status('Objecten ophalen…');

    // getObjects returns groups per model. Object IDs here are runtime IDs.
    const modelGroups = await API.viewer.getObjects();
    if (!Array.isArray(modelGroups) || !modelGroups.length) {
      throw new Error('Trimble Connect geeft geen objecten terug. Controleer of een model volledig geladen is.');
    }

    let totalObjects = 0, withProps = 0, layerFound = 0, labelFound = 0, missingBox = 0;
    const markups = [];
    const diagnostics = [];

    for (const group of modelGroups) {
      const modelId = group.modelId;
      const objects = Array.isArray(group.objects) ? group.objects : [];
      totalObjects += objects.length;
      if (!objects.length) continue;

      const layerList = await API.viewer.getLayers(modelId).catch(() => []);
      console.log('[Prefab labels] Model layers', modelId, layerList);

      // The properties must be requested separately for the runtime object IDs.
      const runtimeIds = objects.map(o => o.id).filter(id => Number.isFinite(id));
      const propertyResults = [];
      for (const batch of chunks(runtimeIds, 400)) {
        const batchResult = await API.viewer.getObjectProperties(modelId, batch);
        if (Array.isArray(batchResult)) propertyResults.push(...batchResult);
      }
      withProps += propertyResults.length;
      console.log('[Prefab labels] Property sample', modelId, propertyResults.slice(0, 3));

      const propertyById = new Map(propertyResults.map(p => [p.id, p]));
      const candidates = [];
      const layerSamples = [];
      for (const obj of objects) {
        const details = propertyById.get(obj.id);
        if (!details) continue;
        const layer = findValue(details, 'Layer');
        if (layerSamples.length < 8 && layer !== undefined) {
          const layerProp = allProps(details).find(x => String(x.name || '').trim().toLowerCase() === 'layer');
          layerSamples.push({ value: layer, set: layerProp?._setName || '(geen propertysetnaam)' });
        }
        if (String(layer ?? '').trim().toUpperCase() !== 'BALK') continue;
        layerFound++;
        const label = findValue(details, 'VEstuk_Nr');
        if (label === undefined || label === null || String(label).trim() === '') continue;
        labelFound++;
        candidates.push({ id: obj.id, text: String(label).trim() });
      }

      diagnostics.push({ modelId, objects: objects.length, propertyResults: propertyResults.length, layers: layerList.map(x => x.name), layerSamples });
      if (!candidates.length) continue;

      for (const batch of chunks(candidates, 400)) {
        const boxes = await API.viewer.getObjectBoundingBoxes(modelId, batch.map(x => x.id));
        const byId = new Map((boxes || []).map(b => [b.id, b.boundingBox]));
        for (const candidate of batch) {
          const box = byId.get(candidate.id);
          if (!box?.min || !box?.max) { missingBox++; continue; }
          const x = (box.min.x + box.max.x) / 2 * 1000;
          const y = (box.min.y + box.max.y) / 2 * 1000;
          const z = (box.min.z + box.max.z) / 2 * 1000;
          const pick = { type: 'point', modelId, objectId: candidate.id, positionX: x, positionY: y, positionZ: z };
          markups.push({ start: pick, end: { ...pick }, text: candidate.text, color: { r: 255, g: 220, b: 0, a: 1 } });
        }
      }
    }

    console.log('[Prefab labels] Diagnostics', diagnostics);
    if (!markups.length) {
      const layerPropertySeen = diagnostics.some(d => d.layerSamples.length > 0);
      const availableLayers = [...new Set(diagnostics.flatMap(d => d.layers || []))];
      status(
        `Geen labels geplaatst.\nObjecten gevonden: ${totalObjects}\nObjecteigenschappen opgehaald: ${withProps}\nLayer = BALK gevonden: ${layerFound}\nMet VEstuk_Nr: ${labelFound}\n\n` +
        `Presentation Layers in model: ${availableLayers.join(', ') || '(geen)'}\n` +
        `Eigenschap 'Layer' in objecten: ${layerPropertySeen ? 'ja' : 'niet aangetroffen'}\n\n` +
        `Diagnostiek staat ook in de browserconsole (F12 > Console). Stuur mij eventueel een screenshot daarvan.`
      );
      return;
    }

    const created = await API.markup.addTextMarkup(markups);
    appMarkupIds = (created || []).map(m => m.id).filter(id => id !== undefined && id !== null);
    status(`${appMarkupIds.length} label(s) geplaatst.\nObjecten gevonden: ${totalObjects}\nObjecteigenschappen opgehaald: ${withProps}\nLayer = BALK: ${layerFound}\nMet VEstuk_Nr: ${labelFound}\nZonder bounding box: ${missingBox}`);
  } catch (e) {
    console.error('[Prefab labels] Fout', e);
    status('Fout: ' + (e?.message || String(e)) + '\n\nOpen eventueel F12 > Console voor meer details.');
  } finally {
    $('show').disabled = false;
  }
}

$('show').addEventListener('click', showLabels);
$('clear').addEventListener('click', async () => {
  try {
    await removeOwnLabels();
    status('Labels van deze sessie verwijderd.');
  } catch (e) { status('Fout: ' + e.message); }
});
connect();
