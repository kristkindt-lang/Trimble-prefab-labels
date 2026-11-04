TRIMBLE CONNECT - PREFAB LABELS (prototype v1)

Files
- index.html : extension UI
- app.js     : Workspace API logic
- manifest.json : extension manifest template

IMPORTANT BEFORE INSTALLING
1. Host this folder on a public HTTPS web host (for example an internal web server or static hosting).
2. Edit manifest.json and replace https://VUL-HIER-JOUW-HOSTNAAM-IN/index.html with the public HTTPS URL of index.html.
3. The manifest.json itself must also be publicly reachable over HTTPS. The host must allow Trimble Connect to fetch it (CORS).
4. In Trimble Connect Browser, open project > Settings > Apps & Capabilities > + Add Custom.
5. Paste the public URL of manifest.json. A project administrator must perform this step.
6. Open the 3D Viewer, load the model and open the extension.

PROTOTYPE ASSUMPTIONS / TEST POINTS
- The app reads object properties through Workspace API getObjects().
- It expects the model property name "Layer" with value "BALK" and property "VEstuk_Nr".
- It places text at the center of the object's bounding box.
- Workspace API bounding-box coordinates are converted from meters to millimeters for markup picks.
- The app tracks markup IDs in the current browser session; after reloading the extension, old labels may remain. The remove button only removes labels created in the current session.
- The app has not yet been tested against the user's Tekla/IFC model. If the layer assignment is not exposed as an ordinary object property, the filter must be adjusted after inspecting the actual API response.

No model properties are edited. Labels are viewer markups.
