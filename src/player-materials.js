/** Clone shared glTF materials per player so club kits never recolor another player. */
export function clonePlayerMaterials(root) {
  const clones = new Map();
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.material) return;
    const cloneOne = (source) => {
      if (!clones.has(source)) clones.set(source, source.clone());
      return clones.get(source);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneOne)
      : cloneOne(object.material);
  });
  return clones;
}
