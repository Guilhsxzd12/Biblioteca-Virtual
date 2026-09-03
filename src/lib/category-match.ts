import type { Category } from "@/lib/types";

function norm(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();}

export function guessCategoryId(categories:Category[],subjects:string[]=[],title="",description=""){
  const hay=norm([...subjects,title,description].join(" | "));
  const find=(name:string)=>categories.find(c=>norm(c.name)===norm(name))?.id||null;
  const rules:[string,string[]][]=[
    ["Terror",["horror","terror","ghost","vampire","zombie","supernatural horror"]],
    ["Fantasia",["fantasy","fantasia","magic","magia","dragons","wizard","fairy","mythical"]],
    ["Romance",["romance","love stories","romantic","amor","relationships"]],
    ["Ação e Aventura",["adventure","aventura","action","acao","thriller","spy","survival"]],
    ["Literatura Brasileira",["brazilian literature","literatura brasileira","brazilian fiction","brasil"]],
    ["Clássicos",["classics","classic literature","classicos","literary classics"]],
    ["Ficção",["fiction","ficcao","novel","literature","literatura"]]
  ];
  for(const [category,words] of rules)if(words.some(w=>hay.includes(norm(w)))){const id=find(category);if(id)return id;}
  for(const c of categories)if(subjects.some(s=>norm(s).includes(norm(c.name))||norm(c.name).includes(norm(s))))return c.id;
  return null;
}
