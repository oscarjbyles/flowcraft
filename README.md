# flowchart builder

a web-based tool for building flowcharts with nodes representing python files. features a dark mode material ui interface with interactive node creation and linking.

## features

- **interactive flowchart creation**: click to add nodes, drag to move them around
- **node connections**: shift+click to connect nodes with links
- **python file nodes**: each node represents a python file
- **json storage**: flowchart structure is stored in json format
- **dark mode material ui**: modern dark theme interface
- **modular sidebar**: extensible sidebar with build and run actions
- **drag and drop**: intuitive node manipulation
- **context menus**: right-click nodes for edit/delete options

## installation

1. create and activate virtual environment:
```bash
python -m venv .venv

# windows
.venv\Scripts\activate

# mac/linux
source .venv/bin/activate
```

2. install dependencies:
```bash
pip install -r requirements.txt
```

## usage

1. start the application:
```bash
python app.py
```

2. open your browser and navigate to `http://localhost:5000`

3. **creating nodes**:
   - click anywhere on the canvas to add a new node
   - use the "add node" button in the sidebar
   - nodes represent python files

4. **connecting nodes**:
   - hold shift and click a source node
   - then click the target node to create a connection
   - press escape to cancel connection mode

5. **editing nodes**:
   - right-click on a node to open context menu
   - select "edit node" to rename the python file
   - select "delete node" to remove it

6. **saving/loading**:
   - use the "save" button to persist your flowchart
   - use the "load" button to restore a saved flowchart
   - data is stored in `flowchart_data.json`

## keyboard shortcuts

- **delete**: delete selected node
- **escape**: cancel connection mode
- **shift+click**: start connection from node

## api endpoints

- `GET /api/flowchart` - retrieve current flowchart data
- `POST /api/flowchart` - save flowchart data
- `POST /api/build` - trigger build action (placeholder)
- `POST /api/run` - trigger run action (placeholder)

## file structure

```
propri/
├── app.py                 # flask backend server
├── requirements.txt       # python dependencies
├── flowchart_data.json   # flowchart storage (created automatically)
├── templates/
│   └── index.html        # main html template
└── static/
    └── flowchart.js      # frontend javascript logic
```

## customization

the sidebar is modular and can be easily extended with additional tools and actions. the build and run functions are currently placeholders that can be implemented for specific workflows.

## technologies used

- **backend**: flask, flask-cors
- **frontend**: html5, css3, javascript (es6+)
- **visualization**: d3.js
- **ui**: material design principles
- **storage**: json file format