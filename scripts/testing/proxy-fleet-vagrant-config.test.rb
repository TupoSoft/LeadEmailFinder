# frozen_string_literal: true

require "fileutils"
require "minitest/autorun"
require "ostruct"
require "tmpdir"
require "yaml"

# Record the configuration produced by the real Vagrantfile without starting a
# provider. Unknown DSL calls still fail, so config changes cannot be ignored.
class RecordingVM
  attr_accessor :box, :box_version, :box_architecture, :box_check_update, :hostname
  attr_reader :providers, :machines

  def initialize
    @providers = {}
    @machines = {}
  end

  def vm
    self
  end

  def provider(name)
    config = OpenStruct.new
    yield config
    @providers[name] = config.to_h
  end

  def define(name, **_options)
    @machines[name] = self.class.new
    yield @machines[name]
  end

  %i[network provision synced_folder].each do |method|
    define_method(method) { |*_args, **_options| nil }
  end
end

module Vagrant
  class << self
    attr_reader :config

    def require_version(_version); end

    def configure(version)
      raise "Unexpected Vagrant config version: #{version}" unless version == "2"

      @config = RecordingVM.new
      yield @config
    end
  end
end

class ProxyFleetVagrantConfigTest < Minitest::Test
  VAGRANTFILE = File.expand_path("../../deploy/proxy-fleet/vagrant/Vagrantfile", __dir__)
  INVENTORY = File.expand_path("../ansible/inventory/vagrant-lab.yml", File.dirname(VAGRANTFILE))
  MACHINES = %w[proxy-manager-1 proxy-node-a proxy-node-b verifier-1].freeze

  def assert_resources(virtualbox_cpus:, libvirt_cpus:, memory:)
    assert_equal MACHINES, Vagrant.config.machines.keys
    Vagrant.config.machines.each_value do |machine|
      %w[virtualbox libvirt].each do |name|
        provider = Vagrant.config.providers.fetch(name).merge(machine.providers.fetch(name, {}))
        assert_equal name == "virtualbox" ? virtualbox_cpus : libvirt_cpus, provider.fetch(:cpus)
        assert_equal memory, provider.fetch(:memory)
      end
    end
  end

  def test_every_virtualbox_guest_uses_one_cpu_while_libvirt_keeps_two
    load VAGRANTFILE

    assert_resources(virtualbox_cpus: 1, libvirt_cpus: 2, memory: 2048)
  end

  def test_provider_cpu_settings_and_shared_memory_follow_the_inventory
    inventory = YAML.safe_load(File.read(INVENTORY), aliases: false)
    lab = inventory.fetch("all").fetch("vars").fetch("vagrant_lab")
    lab.fetch("virtualbox")["cpus"] = 3
    lab.fetch("resources")["cpus"] = 6
    lab.fetch("resources")["memory_mb"] = 4096

    Dir.mktmpdir("proxy-fleet-vagrant-config-") do |directory|
      vagrantfile = File.join(directory, "vagrant", "Vagrantfile")
      inventory_path = File.join(directory, "ansible", "inventory", "vagrant-lab.yml")
      FileUtils.mkdir_p([File.dirname(vagrantfile), File.dirname(inventory_path)])
      FileUtils.cp(VAGRANTFILE, vagrantfile)
      File.write(inventory_path, YAML.dump(inventory))
      load vagrantfile

      assert_resources(virtualbox_cpus: 3, libvirt_cpus: 6, memory: 4096)
    end
  end
end
