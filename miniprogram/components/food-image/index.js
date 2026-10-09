Component({
  properties: { src: { type: String, value: '', observer() { this.setData({ failed: false }); } } },
  data: { failed: false },
  methods: { onImageError() { this.setData({ failed: true }); } },
});
