/**
 * The embed shell. It posts its own height to the parent frame so `public/embed.js` can size the
 * iframe without a scrollbar; `document.documentElement` is measured rather than a wrapper because
 * margins on the outermost element are outside a wrapper's `scrollHeight`.
 */
const RESIZE_SCRIPT = `(function(){
function post(){try{parent.postMessage({type:'cicero-embed-height',height:Math.ceil(document.documentElement.getBoundingClientRect().height)},'*')}catch(e){}}
if(typeof ResizeObserver!=='undefined'){new ResizeObserver(post).observe(document.documentElement)}
addEventListener('load',post);addEventListener('resize',post);post();
})()`;

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <script dangerouslySetInnerHTML={{ __html: RESIZE_SCRIPT }} />
    </>
  );
}
