<p align="center">
<img src="public/deus-ex-aeternae-emblem.svg" alt="Deus ex Aeternae emblem" width="70px"/>
</p>

<h2 align="center"><b>Seanime Web</b></h2>

<h4 align="center">Web interface</h4>

```txt
📁 api
    ├── 📁 client
    ├── 📁 generated
    └── 📁 hooks
📁 app/(main)	
    ├── 📁 _atoms
    ├── 📁 _features
    ├── 📁 _hooks
    ├── 📁 _listeners
    └── 📁 {route}
    	├── 📁 _containers
    	├── 📁 _components
    	├── 📁 _lib
    	├── 📄 layout.tsx
    	└── 📄 page.tsx
📁 components
```

- `api`: API related code.
  - `client`: React-Query and Axios related code.
  - `generated`: Generated types and endpoints.
  - `hooks`: Data-fetching hooks.


- `app`
  - `_atoms`: Global Jotai atoms
  - `_hooks`: Top-level queries (loaders) and global state hooks.
  - `_features`: Specialized components that are used across multiple pages.
  - `_listeners`: Websocket listeners.
  - `{route}`: Route directory.
    - `_components`: Route-specific components that only depend on props.
    - `_containers`: Route-specific components that interact with global state and API.
    - `_lib`: Route-specific utility functions, hooks, constants, and data-related functions.


- `components`: Primitive components, not tied to any feature or route.
