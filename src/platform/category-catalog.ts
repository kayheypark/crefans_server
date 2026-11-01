// Same built-in artwork/order as the service preview. Uploaded artwork takes precedence.
export const categoryDefaults:Record<string,string>={'라이프스타일':'lifestyle','뷰티':'beauty','코스프레':'cosplay','피트니스':'fitness','음악':'music','여행':'travel','게임':'gaming','아트':'art','일상':'daily'};
export const categoryOrder=[{sort_order:'asc'},{name:'asc'}] as const;
export const categoryAsset=(value:string|null)=>/^(local|s3):([0-9a-f-]{36})$/.exec(value||'');
export function categoryView(row:{id:string;name:string;icon:string|null;sort_order:number;is_active:boolean}){
 const asset=categoryAsset(row.icon),builtin=categoryDefaults[row.name];
 return{id:row.id,name:row.name,active:row.is_active,sortOrder:row.sort_order,iconUrl:asset?`/api/v1/categories/${row.id}/icon/${asset[2]}`:builtin?`/brand/categories/${builtin}-round-flat-v1.png`:null,customIcon:!!asset};
}
