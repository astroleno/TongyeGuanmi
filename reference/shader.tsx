<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta http-equiv="Content-Style-Type" content="text/css">
  <title></title>
  <meta name="Generator" content="Cocoa HTML Writer">
  <meta name="CocoaVersion" content="2575.7">
  <style type="text/css">
    p.p1 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px 'PingFang SC'; color: #0000e9; -webkit-text-stroke: #0000e9}
    p.p2 {margin: 0.0px 0.0px 0.0px 0.0px; font: 12.0px 'PingFang SC'; color: #0000e9; -webkit-text-stroke: #0000e9; min-height: 15.0px}
    span.s1 {text-decoration: underline ; font-kerning: none}
  </style>
</head>
<body>
<p class="p1"><span class="s1">// src/components/ui/InteractiveNebulaShader.tsx</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1">import React, { useEffect, useRef } from "react";</span></p>
<p class="p1"><span class="s1">import * as THREE from "three";</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1">export interface InteractiveNebulaShaderProps {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>hasActiveReminders?: boolean;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>hasUpcomingReminders?: boolean;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>disableCenterDimming?: boolean;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>className?: string;</span></p>
<p class="p1"><span class="s1">}</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1">/**</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* Full-screen nebula shader background.</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>* Props drive three GLSL uniforms—no demo markup here.</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space"> </span>*/</span></p>
<p class="p1"><span class="s1">export function InteractiveNebulaShader({</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>hasActiveReminders = false,</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>hasUpcomingReminders = false,</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>disableCenterDimming = false,</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>className = "",</span></p>
<p class="p1"><span class="s1">}: InteractiveNebulaShaderProps) {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>const containerRef = useRef&lt;HTMLDivElement&gt;(null);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>const materialRef<span class="Apple-converted-space">  </span>= useRef&lt;THREE.ShaderMaterial&gt;();</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>// Sync props into uniforms</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>useEffect(() =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const mat = materialRef.current;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>if (mat) {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>mat.uniforms.hasActiveReminders.value <span class="Apple-converted-space">  </span>= hasActiveReminders;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>mat.uniforms.hasUpcomingReminders.value = hasUpcomingReminders;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>mat.uniforms.disableCenterDimming.value = disableCenterDimming;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>}, [hasActiveReminders, hasUpcomingReminders, disableCenterDimming]);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>useEffect(() =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const container = containerRef.current;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>if (!container) return;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Renderer, scene, camera, clock</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>renderer.setPixelRatio(window.devicePixelRatio);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>container.appendChild(renderer.domElement);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const scene<span class="Apple-converted-space">  </span>= new THREE.Scene();</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const clock<span class="Apple-converted-space">  </span>= new THREE.Clock();</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Vertex shader: pass UVs</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const vertexShader = `</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>varying vec2 vUv;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>void main() {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>vUv = uv;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>gl_Position = vec4(position, 1.0);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>`;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Ray-marched nebula fragment shader with reminder-driven palettes</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const fragmentShader = `</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>precision mediump float;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform vec2 iResolution;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform float iTime;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform vec2 iMouse;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform bool hasActiveReminders;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform bool hasUpcomingReminders;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniform bool disableCenterDimming;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>varying vec2 vUv;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>#define t iTime</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>mat2 m(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>float map(vec3 p){</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>p.xz *= m(t*0.4);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>p.xy *= m(t*0.3);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>vec3 q = p*2. + t;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>return length(p + vec3(sin(t*0.7))) * log(length(p)+1.0)</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">             </span>+ sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>}</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>void mainImage(out vec4 O, in vec2 fragCoord) {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>vec2 uv = fragCoord / min(iResolution.x, iResolution.y) - vec2(.9, .5);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>uv.x += .4;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>vec3 col = vec3(0.0);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>float d = 2.5;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>// Ray-march</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>for (int i = 0; i &lt;= 5; i++) {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>vec3 p = vec3(0,0,5.) + normalize(vec3(uv, -1.)) * d;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>float rz = map(p);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>float f<span class="Apple-converted-space">  </span>= clamp((rz - map(p + 0.1)) * 0.5, -0.1, 1.0);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>vec3 base = hasActiveReminders</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>? vec3(0.05,0.2,0.5) + vec3(4.0,2.0,5.0)*f</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>: hasUpcomingReminders</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>? vec3(0.05,0.3,0.1) + vec3(2.0,5.0,1.0)*f</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">            </span>: vec3(0.1,0.3,0.4) + vec3(5.0,2.5,3.0)*f;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>d += min(rz, 1.0);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>}</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>// Center dimming</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>float dist <span class="Apple-converted-space">  </span>= distance(fragCoord, iResolution*0.5);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>float radius = min(iResolution.x, iResolution.y) * 0.5;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>float dim<span class="Apple-converted-space">    </span>= disableCenterDimming</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">                     </span>? 1.0</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">                     </span>: smoothstep(radius*0.3, radius*0.5, dist);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>O = vec4(col, 1.0);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>if (!disableCenterDimming) {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">          </span>O.rgb = mix(O.rgb * 0.3, O.rgb, dim);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>}</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>void main() {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">        </span>mainImage(gl_FragColor, vUv * iResolution);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>`;</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Uniforms</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const uniforms = {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>iTime:<span class="Apple-converted-space">                </span>{ value: 0 },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>iResolution:<span class="Apple-converted-space">          </span>{ value: new THREE.Vector2() },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>iMouse: <span class="Apple-converted-space">              </span>{ value: new THREE.Vector2() },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>hasActiveReminders: <span class="Apple-converted-space">  </span>{ value: hasActiveReminders },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>hasUpcomingReminders: { value: hasUpcomingReminders },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>disableCenterDimming: { value: disableCenterDimming },</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>};</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms });</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>materialRef.current = material;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>scene.add(mesh);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Resize &amp; mouse</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const onResize = () =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>const w = container.clientWidth;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>const h = container.clientHeight;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>renderer.setSize(w, h);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniforms.iResolution.value.set(w, h);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>};</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>const onMouseMove = (e: MouseEvent) =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniforms.iMouse.value.set(e.clientX, window.innerHeight - e.clientY);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>};</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>window.addEventListener("resize", onResize);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>window.addEventListener("mousemove", onMouseMove);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>onResize();</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>// Animation loop</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>renderer.setAnimationLoop(() =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>uniforms.iTime.value = clock.getElapsedTime();</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>renderer.render(scene, camera);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>});</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>return () =&gt; {</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>window.removeEventListener("resize", onResize);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>window.removeEventListener("mousemove", onMouseMove);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>renderer.setAnimationLoop(null);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>container.removeChild(renderer.domElement);</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>material.dispose();</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>mesh.geometry.dispose();</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>renderer.dispose();</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>};</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>}, []);</span></p>
<p class="p2"><span class="s1"></span><br></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>return (</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>&lt;div</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>ref={containerRef}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>className={`fixed inset-0 bg-background ${className}`}</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">      </span>aria-label="Interactive nebula background"</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">    </span>/&gt;</span></p>
<p class="p1"><span class="s1"><span class="Apple-converted-space">  </span>);</span></p>
<p class="p1"><span class="s1">}</span></p>
</body>
</html>
