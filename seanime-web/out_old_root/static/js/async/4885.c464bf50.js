"use strict";(self.webpackChunkseanime_web=self.webpackChunkseanime_web||[]).push([["4885"],{59913(e,t,n){n.d(t,{j:()=>b});var i=n(39974),o=n(53357),r=n(92486),d=n(90155),l=n(36622),s=n(19716),a=n(38390),w=n(76063),u=n(25944),v=n(93672),c=n(86050),f=n(77546),g=n(64319);let h=(0,w.vF)("PLUGIN WEBVIEWS");function b(e){let{slot:t}=e,n=(0,c.a8)(),l=(0,c.ok)(),{sendWebviewMountedEvent:s}=(0,o.x0)(),{sendWebviewUnmountedEvent:w}=(0,o.Nz)(),{sendWebviewPostMessageEvent:b}=(0,o.lv)(),m=(0,d.iK)(),x=(0,d.tU)(),y=a.useRef(x.current),I=(0,v.ko)(),E=a.useRef(I);a.useEffect(()=>{E.current=I},[I]);let k=a.useRef(!1);function W(e){return document.getElementById(`webview-${e}`)}(0,f.A)(()=>{x&&(h.info("Mounting webview slot",t),s({slot:t}),k.current=!0)}),(0,g.A)(()=>{x&&(h.info("Unmounting webview slot",t),w({slot:t}),k.current=!1)}),a.useEffect(()=>{k.current&&(m&&!y.current&&(h.info("Mounting webview slot because main tab changed",t),s({slot:t})),y.current=m)},[m]),a.useEffect(()=>{let e=e=>{if(e.origin!==window.location.origin&&"null"!==e.origin)return void h.warn("Rejected message from invalid origin",e.origin);let t=e.data,n=E.current.get(t.webviewId);if(n){if(t.token!==n.token)return void h.warn("Rejected message with invalid token",{webviewId:t.webviewId});if("plugin-webview-resize"===t.type){var i,o;if(null==(i=n.options)?void 0:i.autoHeight){let e=W(t.webviewId);e&&(e.style.height=`${t.height}px`,(null==(o=n.options)?void 0:o.fullWidth)||(e.style.width=`${t.width}px`))}return}if("plugin-webview-request-container-width"===t.type){let e=W(t.webviewId);if(e&&e.contentWindow){let t=e.parentElement,i=(null==t?void 0:t.clientWidth)||window.innerWidth;e.contentWindow.postMessage({type:"plugin-webview-container-width",width:i,token:n.token},"*")}return}"plugin-webview-trigger"===t.type&&(h.info("Forwarding webview event to server",{extensionId:n.extensionId,event:t.event}),b({slot:n.slot,eventName:t.event,event:t.payload||{}},n.extensionId))}};return window.addEventListener("message",e),()=>window.removeEventListener("message",e)},[t]),(0,g.A)(()=>{I.clear()}),(0,r.oA)({type:"plugin-unloaded",onMessage:e=>{x&&I.forEach((t,n)=>{t.extensionId===e&&I.delete(n)})}});let R=a.useCallback((e,t,n)=>{let i=I.get(e);i&&I.set(e,{...i,position:{x:t,y:n}})},[I]);a.useCallback((e,t,n)=>{let i=I.get(e);i&&I.set(e,{...i,preservedSize:{width:t,height:n}})},[I]);let N=a.useCallback(e=>{var t;I.delete(e),null==(t=document.getElementById(`webview-${e}`))||t.remove()},[I]),$=a.useCallback((e,n)=>{var i,o;let r,d;if(h.info("Setting up iframe webview",{extensionId:e}),!x)return;let l=`${e}-${t}`,s=I.get(l),a=null==s?void 0:s.position,w=null==s?void 0:s.preservedSize;I.has(l)&&I.delete(l);let u=`${Date.now()}-${Math.random().toString(36).substring(2,15)}`,v=(i=n.content,o=window.location.origin,r=`
    const WEBVIEW_TOKEN = "${u}"
    const PARENT_ORIGIN = "${o}"

    window.webview = {
        // Send a message to Seanime
        send: (event, payload) => {
            window.parent.postMessage({
                type: "plugin-webview-trigger",
                event,
                payload,
                webviewId: "${l}",
                token: WEBVIEW_TOKEN
            }, PARENT_ORIGIN)
        },
        // Receive messages from Seanime
        on: (event, callback) => {
            const handler = (e) => {
                const isTrustedOrigin = e.origin === PARENT_ORIGIN || e.origin === "null"
                if (!isTrustedOrigin || e.data.token !== WEBVIEW_TOKEN) return
                // State syncing
                if (e.data.type === "plugin-webview-sync" && e.data.key === event) {
                    callback(e.data.value)
                }
                // Handle response from requestContainerWidth()
                if (e.data.type === "plugin-webview-container-width") {
                    if (event === "containerWidth") {
                        callback(e.data.width)
                    }
                }
            }
            window.addEventListener("message", handler)
            // Return cancel function
            return () => {
                window.removeEventListener("message", handler)
            }
        },
        // Get the width of the container the webview is in.
        requestContainerWidth: () => {
            window.parent.postMessage({
                type: "plugin-webview-request-container-width",
                webviewId: "${l}",
                token: WEBVIEW_TOKEN
            }, PARENT_ORIGIN)
        },
        // Notify Seanime when the webview body changed size
        _onResizeObserved: () => {
            const height = document.body.scrollHeight
            const width = document.body.scrollWidth
            window.parent.postMessage({
                type: "plugin-webview-resize",
                webviewId: "${l}",
                width: width,
                height: height,
                token: WEBVIEW_TOKEN
            }, PARENT_ORIGIN)
        }
    }

    // Notify Seanime to resize iframe when content changes
    if (window.ResizeObserver) {
        window.addEventListener("load", () => {
            const resizeObserver = new ResizeObserver(() => {
                if (window.webview) window.webview._onResizeObserved()
            })
            if (document.body) {
                resizeObserver.observe(document.body)
            }
        })
    }
`,d=`<script>${r}</script>`,i.includes("<head>")?i.replace("<head>",`<head>
${d}`):i.includes("<body>")?i.replace("<body>",`<body>
${d}`):d+i),c=n.options;I.set(l,{webviewId:l,extensionId:e,src:v,token:u,options:c,position:a,preservedSize:w,slot:t})},[I]);return((0,o.PR)((e,i)=>{if(x&&e.slot===t){if("screen"!==e.slot||"/webview"===n&&i===l.get("id"))$(i,e)}},""),(0,o.pT)((e,t)=>{if(!x.current)return;let n=I.get(e.webviewId);if(!n)return;let i=W(n.webviewId);i&&i.contentWindow?i.contentWindow.postMessage({type:"plugin-webview-sync",key:e.key,value:e.value,token:n.token},"*"):h.warn("Cannot find iframe element for webview",e.webviewId)},""),(0,o.Dm)((e,t)=>{if(!x)return;let n=I.get(e.webviewId);if(n){var i;I.delete(n.webviewId),null==(i=document.getElementById(`webview-${n.webviewId}`))||i.remove()}},""),"fixed"===t)?(0,i.jsx)(i.Fragment,{children:(0,i.jsx)(u.Z,{container:document.body,className:"plugin-webview-portal",children:Array.from(I.values()).map(e=>(0,i.jsx)(p,{webview:e,onUpdatePosition:R,onClose:N},e.webviewId))})}):(0,i.jsx)(i.Fragment,{children:Array.from(I.values()).map(e=>(0,i.jsx)(p,{webview:e,onUpdatePosition:R,onClose:N},e.webviewId))})}function p(e){var t,n,r,d;let{webview:w,onUpdatePosition:u,onClose:v}=e,{sendWebviewLoadedEvent:c}=(0,o.bQ)(),f=w.options||{},g=a.useRef(null),[b,p]=a.useState(!1),m=a.useRef({x:0,y:0,elemX:0,elemY:0}),x=a.useRef({paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:80});function y(e){var t;return Math.max(x.current.paddingLeft,Math.min(e,window.innerWidth-((null==(t=g.current)?void 0:t.offsetWidth)||0)-x.current.paddingRight))}function I(e){var t;return Math.max(x.current.paddingTop,Math.min(e,window.innerHeight-((null==(t=g.current)?void 0:t.offsetHeight)||0)-x.current.paddingBottom))}let E=a.useMemo(()=>{var e,t,n,i,o,r,d;let l=y((null==f||null==(e=f.window)?void 0:e.defaultX)||0),s=I((null==f||null==(t=f.window)?void 0:t.defaultY)||0);if((null==f||null==(n=f.window)?void 0:n.defaultPosition)&&window){let e=window.innerWidth,t=window.innerHeight;switch(f.window.defaultPosition){case"top-left":l=10,s=10;break;case"top-right":l=e-((null==(i=g.current)?void 0:i.offsetWidth)||0)-10,s=10;break;case"bottom-left":l=10,s=t-((null==(o=g.current)?void 0:o.offsetHeight)||0)-10;break;case"bottom-right":l=e-((null==(r=g.current)?void 0:r.offsetWidth)||0)-10,s=t-((null==(d=g.current)?void 0:d.offsetHeight)||0)-10}}return{x:l,y:s}},[g.current]),k=w.position||E,W=a.useMemo(()=>{var e,t;return null==(t=f.style)||null==(e=t.split(";"))?void 0:e.reduce((e,t)=>{let[n,i]=t.split(":").map(e=>e.trim());return n&&i&&(e[n.replace(/-([a-z])/g,e=>e[1].toUpperCase())]=i),e},{})},[f.style]),R=a.useMemo(()=>{var e,t,n,i,o,r,d;let l={position:"fixed"===w.slot?"fixed":"relative",border:"none",zIndex:f.zIndex||("fixed"===w.slot?100:5),background:"transparent"};return"fixed"!==w.slot||(null==(t=w.options)||null==(e=t.window)?void 0:e.frameless)||(l.overflow="hidden",l.borderRadius="1rem",l.borderColor="var(--border)",l.borderStyle="solid",l.borderWidth="1px",l.backgroundColor="var(--background)",l.boxShadow="var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)"),f.fullWidth?l.width="100%":f.width&&(l.width=f.width),f.height?l.height=f.height:f.autoHeight&&(l.height="auto"),f.maxWidth&&(l.maxWidth=f.maxWidth),f.maxHeight&&(l.maxHeight=f.maxHeight),"fixed"===w.slot&&((null==f||null==(n=f.window)?void 0:n.draggable)?(l.left=`${k.x}px`,l.top=`${k.y}px`):(l.left=(null==f||null==(i=f.window)?void 0:i.defaultX)!==void 0?`${null==f||null==(o=f.window)?void 0:o.defaultX}px`:"0",l.top=(null==f||null==(r=f.window)?void 0:r.defaultY)!==void 0?`${null==f||null==(d=f.window)?void 0:d.defaultY}px`:"0")),W&&Object.assign(l,W),l},[w.slot,f,k,W]),N=a.useCallback(e=>{var t;(null==f||null==(t=f.window)?void 0:t.draggable)&&(e.preventDefault(),p(!0),m.current={x:e.clientX,y:e.clientY,elemX:k.x,elemY:k.y})},[null==f||null==(t=f.window)?void 0:t.draggable,k]);a.useEffect(()=>{if(!b)return;let e=e=>{let t=e.clientX-m.current.x,n=e.clientY-m.current.y,i=y(m.current.elemX+t),o=I(m.current.elemY+n);u(w.webviewId,i,o)},t=()=>p(!1);return document.addEventListener("mousemove",e),document.addEventListener("mouseup",t),()=>{document.removeEventListener("mousemove",e),document.removeEventListener("mouseup",t)}},[b,u,w.webviewId]);let{width:$}=function(e){let t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:[],[n,i]=(0,a.useState)({width:0,height:0,top:0,left:0,bottom:0,right:0,x:0,y:0});return(0,s.Es)(()=>{let t=e.current;if(!t)return;let n=new ResizeObserver(e=>{for(let t of e){let e=t.target.getBoundingClientRect();i({width:e.width,height:e.height,top:e.top,left:e.left,bottom:e.bottom,right:e.right,x:e.x,y:e.y})}});return n.observe(t),()=>{n.disconnect()}},[e,...t]),n}(g,[null==(n=w.options)?void 0:n.hidden]);return(null==(r=w.options)?void 0:r.hidden)?null:(0,i.jsxs)("div",{"data-webview-container":w.webviewId,style:{..."fixed"===w.slot?{position:"fixed",left:k.x,top:k.y,zIndex:f.zIndex||("fixed"===w.slot?100:5)}:{display:"block",width:"100%"}},children:[!!(null==f||null==(d=f.window)?void 0:d.draggable)&&"fixed"===w.slot&&(0,i.jsx)("div",{"data-plugin-webview-el":"drag-handle",onMouseDown:N,className:"absolute top-0 left-0 right-0 h-8 cursor-move z-[9999]",style:{pointerEvents:"auto",width:$}}),(0,i.jsx)("iframe",{ref:g,id:`webview-${w.webviewId}`,srcDoc:w.src,sandbox:"allow-scripts allow-forms",style:R,onLoad:()=>{h.info("Loaded iframe webview",w.webviewId),c({slot:w.slot},w.extensionId)},className:(0,l.cn)(b&&"pointer-events-none",f.className)})]})}},19716(e,t,n){n.d(t,{Es:()=>r,ML:()=>o,w5:()=>d});var i=n(38390);function o(e,t,n,o){let d=i.useRef(t);r(()=>{d.current=t},[t]),i.useEffect(()=>{let t=(null==n?void 0:n.current)??window;if(!(t&&t.addEventListener))return;let i=e=>d.current(e);return t.addEventListener(e,i,o),()=>{t.removeEventListener(e,i,o)}},[e,n,o])}let r="u">typeof window?i.useLayoutEffect:i.useEffect;function d(e,t){let n=i.useRef(!0);i.useEffect(()=>{if(!n.current)return e();n.current=!1},t)}}}]);