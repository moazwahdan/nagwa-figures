import { create } from 'zustand';
import { CUSTOM_KEY, parseCustomText, customText, type CustomShape } from './customShapes';
export const useCustomStore=create<{shapes:CustomShape[];previous:CustomShape[]|null;error:string;set:(shapes:CustomShape[])=>void;undo:()=>void}>(set=>({
  shapes:[],previous:null,error:'',
  set:shapes=>{const checked=parseCustomText(customText(shapes));set(s=>({shapes:checked,previous:s.shapes}));persist();},
  undo:()=>{set(s=>s.previous?{shapes:s.previous,previous:s.shapes}:{});persist();},
}));
function persist(){try{localStorage.setItem(CUSTOM_KEY,customText(useCustomStore.getState().shapes));useCustomStore.setState({error:''});}catch{useCustomStore.setState({error:'Custom shapes could not be autosaved. Export collection to keep a backup.'});}}
export function restoreCustom(){try{const text=localStorage.getItem(CUSTOM_KEY);if(text)useCustomStore.setState({shapes:parseCustomText(text),previous:null,error:''});}catch{useCustomStore.setState({error:'Saved custom collection could not be read. Import your exported collection to recover it.'});}}
