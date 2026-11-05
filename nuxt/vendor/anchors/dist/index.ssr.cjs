'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const ENTITY = "data-druxt-entity";
const TYPE = "data-druxt-type";
const FIELD = "data-druxt-field";
const DELTA = "data-druxt-delta";
const entityAnchors = (type, id) => {
  if (!id)
    return {};
  return type ? { [ENTITY]: id, [TYPE]: type } : { [ENTITY]: id };
};
const isDelta = (delta) => Number.isInteger(delta) && delta >= 0;
const fieldAnchors = (name, delta) => {
  if (!name)
    return {};
  const anchors = { [FIELD]: name };
  if (isDelta(delta))
    anchors[DELTA] = String(delta);
  return anchors;
};
const escapeValue = (value) => String(value).replace(/["\\]/g, "\\$&");
const findAnchor = (root, { entity, type, field, delta } = {}) => {
  if (!root || typeof root.querySelector !== "function")
    return null;
  const wrapper = [];
  if (entity)
    wrapper.push(`[${ENTITY}="${escapeValue(entity)}"]`);
  if (type)
    wrapper.push(`[${TYPE}="${escapeValue(type)}"]`);
  const item = [];
  if (field) {
    item.push(`[${FIELD}="${escapeValue(field)}"]`);
    if (isDelta(delta))
      item.push(`[${DELTA}="${escapeValue(delta)}"]`);
  }
  const levels = [wrapper.join(""), item.join("")].filter(Boolean);
  if (!levels.length)
    return null;
  return root.querySelector(levels.join(" "));
};

exports.DELTA = DELTA;
exports.ENTITY = ENTITY;
exports.FIELD = FIELD;
exports.TYPE = TYPE;
exports.entityAnchors = entityAnchors;
exports.escapeValue = escapeValue;
exports.fieldAnchors = fieldAnchors;
exports.findAnchor = findAnchor;
